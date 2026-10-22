import type { PNG } from "pngjs";
import type {
  ElementChange,
  ElementSnapshot,
  Rect,
  Region,
} from "./types.ts";
import { REGION_MIN_AREA, REGION_MIN_DIM } from "./regionCluster.ts";

/** Max ratio of intersection to min(element area) for two widgets to count as separate. */
const SPLIT_PAIR_MAX_OVERLAP_RATIO = 0.35;

const IMAGE_PAD = 2;

function intersectionArea(a: Rect, b: Rect): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

function area(r: Rect): number {
  return r.w * r.h;
}

function regionToCssRect(region: Region, dpr: number): Rect {
  return {
    x: region.x / dpr,
    y: region.y / dpr,
    w: region.w / dpr,
    h: region.h / dpr,
  };
}

/** True if `outer`'s bbox fully contains `inner` (small tolerance). */
function rectContainsOuter(outer: Rect, inner: Rect, tol = 2): boolean {
  return (
    outer.x - tol <= inner.x &&
    outer.y - tol <= inner.y &&
    outer.x + outer.w + tol >= inner.x + inner.w &&
    outer.y + outer.h + tol >= inner.y + inner.h
  );
}

function elRectToImageRegion(r: Rect, dpr: number): Region {
  return {
    x: Math.floor(r.x * dpr),
    y: Math.floor(r.y * dpr),
    w: Math.max(1, Math.ceil(r.w * dpr)),
    h: Math.max(1, Math.ceil(r.h * dpr)),
    pixelCount: 0,
  };
}

function intersectImageRegions(a: Region, b: Region): Region | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const w = x2 - x1;
  const h = y2 - y1;
  if (w < REGION_MIN_DIM || h < REGION_MIN_DIM || w * h < REGION_MIN_AREA) {
    return null;
  }
  return { x: x1, y: y1, w, h, pixelCount: 0 };
}

function expandImageRegion(
  r: Region,
  pad: number,
  maxW: number,
  maxH: number
): Region {
  const x = Math.max(0, r.x - pad);
  const y = Math.max(0, r.y - pad);
  const right = Math.min(maxW, r.x + r.w + pad);
  const bottom = Math.min(maxH, r.y + r.h + pad);
  return {
    x,
    y,
    w: right - x,
    h: bottom - y,
    pixelCount: 0,
  };
}

function countMaskPixels(png: PNG, r: Region): number {
  let n = 0;
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(png.width, r.x + r.w);
  const y1 = Math.min(png.height, r.y + r.h);
  for (let y = y0; y < y1; y++) {
    const row = y * png.width;
    for (let x = x0; x < x1; x++) {
      const a = png.data[(row + x) * 4 + 3];
      if (a > 0) n++;
    }
  }
  return n;
}

function overlapsRegionMeaningfully(el: ElementSnapshot, regionCss: Rect): boolean {
  const inter = intersectionArea(el.rect, regionCss);
  if (inter === 0) return false;
  const regionArea = area(regionCss) || 1;
  const elArea = area(el.rect) || 1;
  const coverageOfRegion = inter / regionArea;
  const coverageOfElement = inter / elArea;
  return coverageOfRegion >= 0.1 || coverageOfElement >= 0.5;
}

function pairwiseIndependent(rects: Rect[]): boolean {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const inter = intersectionArea(rects[i], rects[j]);
      const denom = Math.min(area(rects[i]), area(rects[j])) || 1;
      if (inter / denom >= SPLIT_PAIR_MAX_OVERLAP_RATIO) return false;
    }
  }
  return true;
}

/**
 * When one pixel cluster spans multiple disjoint DOM edits (e.g. merged hero
 * hero + background), split the region into one bbox per attributed element.
 */
export function splitRegionsByChangedElements(
  regions: Region[],
  changes: ElementChange[],
  currentElements: ElementSnapshot[],
  dpr: number,
  mask: PNG
): Region[] {
  const xpathToEl = new Map<string, ElementSnapshot>();
  for (const el of currentElements) xpathToEl.set(el.xpath, el);

  const xpathHasChange = new Set<string>();
  for (const ch of changes) xpathHasChange.add(ch.xpath);

  const out: Region[] = [];

  for (const R of regions) {
    const regionCss = regionToCssRect(R, dpr);
    const candidates: ElementSnapshot[] = [];
    for (const xpath of xpathHasChange) {
      const el = xpathToEl.get(xpath);
      if (!el) continue;
      if (!overlapsRegionMeaningfully(el, regionCss)) continue;
      candidates.push(el);
    }

    const byDepthDesc = [...candidates].sort((a, b) => b.depth - a.depth);
    const pruned: ElementSnapshot[] = [];
    for (const c of byDepthDesc) {
      const containsExisting = pruned.some((r) => rectContainsOuter(c.rect, r.rect));
      if (containsExisting) continue;
      const insideExisting = pruned.some((r) => rectContainsOuter(r.rect, c.rect));
      if (insideExisting) continue;
      pruned.push(c);
    }

    const rects = pruned.map((e) => e.rect);
    if (
      pruned.length < 2 ||
      !pairwiseIndependent(rects)
    ) {
      out.push(R);
      continue;
    }

    const subs: Region[] = [];
    const expandedMaxW = mask.width;
    const expandedMaxH = mask.height;

    for (const el of pruned) {
      let imgR = elRectToImageRegion(el.rect, dpr);
      imgR = expandImageRegion(imgR, IMAGE_PAD, expandedMaxW, expandedMaxH);
      const clipped = intersectImageRegions(R, imgR);
      if (!clipped) continue;
      const px = countMaskPixels(mask, clipped);
      if (px === 0) continue;
      subs.push({ ...clipped, pixelCount: px });
    }

    subs.sort((a, b) => b.pixelCount - a.pixelCount);
    if (subs.length < 2) {
      out.push(R);
    } else {
      out.push(...subs);
    }
  }

  return out;
}
