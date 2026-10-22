import type {
  ElementChange,
  ElementSnapshot,
  Rect,
  Region,
  RegionAnalysis,
} from "./types.ts";

/**
 * Convert a region (in image-pixel coordinates) to CSS-pixel coordinates by
 * dividing by devicePixelRatio. DOM rects from the SDK are in CSS pixels.
 */
function regionToCssRect(region: Region, dpr: number): Rect {
  return {
    x: region.x / dpr,
    y: region.y / dpr,
    w: region.w / dpr,
    h: region.h / dpr,
  };
}

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

function parentXpath(xpath: string): string | null {
  const parts = xpath.split("/").filter(Boolean);
  if (parts.length <= 1) return null;
  return "/" + parts.slice(0, -1).join("/");
}

/** True if `inner`'s bounding box is inside `outer` (with a small tolerance). */
function rectContainsOuter(
  outer: Rect,
  inner: Rect,
  tol = 2
): boolean {
  return (
    outer.x - tol <= inner.x &&
    outer.y - tol <= inner.y &&
    outer.x + outer.w + tol >= inner.x + inner.w &&
    outer.y + outer.h + tol >= inner.y + inner.h
  );
}

function firstShift(
  changes: ElementChange[] | undefined
):
  | Extract<ElementChange, { kind: "shifted" }>
  | undefined {
  if (!changes) return undefined;
  const s = changes.find((c) => c.kind === "shifted");
  return s?.kind === "shifted" ? s : undefined;
}

function deltaEq(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 1 && Math.abs(a[1] - b[1]) < 1;
}

const BACKGROUND_STYLE_PROPS = new Set([
  "backgroundImage",
  "backgroundColor",
  "background",
]);

/**
 * Gradients and images live in `backgroundImage` / `background`, not in
 * `backgroundColor`. Hit-testing often lands on a text child (e.g. `span`)
 * whose computed styles are unchanged while the parent `nav` paint differs.
 * Walk up to the innermost ancestor that overlaps the diff region and has a
 * tracked `styled` diff on a background-related property.
 */
function promoteToBackgroundPaintAncestor(
  deep: ElementSnapshot,
  regionCss: Rect,
  changeByXpath: Map<string, ElementChange[]>,
  xpathToEl: Map<string, ElementSnapshot>
): ElementSnapshot | null {
  const regionArea = area(regionCss) || 1;
  let best: ElementSnapshot | null = null;
  let bestDepth = -Infinity;

  let xp: string | null = deep.xpath;
  while ((xp = parentXpath(xp))) {
    const el = xpathToEl.get(xp);
    if (!el) continue;
    const inter = intersectionArea(el.rect, regionCss);
    if (inter / regionArea < 0.2) continue;

    const chs = changeByXpath.get(el.xpath) ?? [];
    const styled = chs.find((c) => c.kind === "styled");
    if (styled?.kind !== "styled") continue;
    const hitsBg = styled.styleDiff.some((e) =>
      BACKGROUND_STYLE_PROPS.has(e.prop)
    );
    if (!hitsBg) continue;

    if (el.depth > bestDepth) {
      bestDepth = el.depth;
      best = el;
    }
  }

  return best;
}

/**
 * When a title/paragraph/icon moved because its parent card moved, the pixel
 * cluster often sits on the leaf only, but the meaningful unit is the card.
 *
 * Walk up the xpath chain; among ancestors whose bbox contains the leaf's
 * bbox and that share the same `shifted` delta in the coord diff, pick the
 * **innermost** such ancestor (largest `depth` while still strictly below
 * the leaf's depth) — typically `div.card`, not `div.cards` / `body`.
 */
function promoteToShiftedLayoutAncestor(
  deep: ElementSnapshot,
  changeByXpath: Map<string, ElementChange[]>,
  xpathToEl: Map<string, ElementSnapshot>
): ElementSnapshot {
  const deepShift = firstShift(changeByXpath.get(deep.xpath));
  if (!deepShift) return deep;

  let best = deep;
  let bestAncestorDepth = -Infinity;

  let xp: string | null = deep.xpath;
  while ((xp = parentXpath(xp))) {
    const el = xpathToEl.get(xp);
    if (!el) continue;
    if (!rectContainsOuter(el.rect, deep.rect)) continue;
    const ancShift = firstShift(changeByXpath.get(el.xpath));
    if (!ancShift || !deltaEq(ancShift.deltaXY, deepShift.deltaXY)) continue;
    if (el.depth >= deep.depth) continue;
    if (el.depth > bestAncestorDepth) {
      bestAncestorDepth = el.depth;
      best = el;
    }
  }

  return best;
}

function cssRectToImageRegion(r: Rect, dpr: number, pixelCount: number): Region {
  return {
    x: Math.floor(r.x * dpr),
    y: Math.floor(r.y * dpr),
    w: Math.max(1, Math.ceil(r.w * dpr)),
    h: Math.max(1, Math.ceil(r.h * dpr)),
    pixelCount,
  };
}

function unionImageRegions(a: Region, b: Region): Region {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    pixelCount: a.pixelCount,
  };
}

/**
 * Score how well an element explains a diff region. We want the deepest
 * element whose rect overlaps the region significantly. Rules:
 *   - element must overlap region by at least 10% of the region area, OR
 *     be fully inside the region (small element inside larger diff).
 *   - rank by depth desc, then by overlap-over-element-area desc.
 */
function rankElementsForRegion(
  region: Rect,
  elements: ElementSnapshot[]
): { el: ElementSnapshot; coverage: number }[] {
  const ranked: { el: ElementSnapshot; coverage: number }[] = [];
  const regionArea = area(region);
  for (const el of elements) {
    const inter = intersectionArea(region, el.rect);
    if (inter === 0) continue;
    const elArea = area(el.rect) || 1;
    const coverageOfRegion = inter / regionArea;
    const coverageOfElement = inter / elArea;
    if (coverageOfRegion >= 0.1 || coverageOfElement >= 0.5) {
      ranked.push({ el, coverage: coverageOfElement });
    }
  }
  ranked.sort((a, b) => {
    if (b.el.depth !== a.el.depth) return b.el.depth - a.el.depth;
    return b.coverage - a.coverage;
  });
  return ranked;
}

function buildRegionEntry(
  index: number,
  region: Region,
  deep: ElementSnapshot,
  ranked: { el: ElementSnapshot; coverage: number }[],
  changeByXpath: Map<string, ElementChange[]>,
  xpathToCurrent: Map<string, ElementSnapshot>,
  dpr: number
): RegionAnalysis {
  const cssRect = regionToCssRect(region, dpr);

  function resolvePrimaryForDeep(hit: ElementSnapshot): {
    primary: ElementSnapshot;
    change: ElementChange | undefined;
  } {
    let primary = promoteToShiftedLayoutAncestor(
      hit,
      changeByXpath,
      xpathToCurrent
    );
    let change = pickBestChange(changeByXpath.get(primary.xpath));
    if (!change) {
      const bgAnc = promoteToBackgroundPaintAncestor(
        hit,
        cssRect,
        changeByXpath,
        xpathToCurrent
      );
      if (bgAnc) {
        primary = bgAnc;
        change = pickBestChange(changeByXpath.get(primary.xpath));
      }
    }
    return { primary, change };
  }

  let deepEl = deep;
  let { primary, change } = resolvePrimaryForDeep(deepEl);
  if (!change) {
    for (const { el } of ranked.slice(1)) {
      const attempt = resolvePrimaryForDeep(el);
      if (attempt.change) {
        deepEl = el;
        primary = attempt.primary;
        change = attempt.change;
        break;
      }
    }
  }

  const suspectRectImage = cssRectToImageRegion(
    primary.rect,
    dpr,
    region.pixelCount
  );
  const displayRegion =
    primary.xpath !== deepEl.xpath
      ? unionImageRegions(region, suspectRectImage)
      : undefined;

  return {
    index,
    region,
    ...(displayRegion ? { displayRegion } : {}),
    primarySuspect: {
      xpath: primary.xpath,
      cssSelector: primary.cssSelector,
      tag: primary.tag,
      rect: primary.rect,
      change,
      visualOnly: !change,
    },
    candidates: ranked.slice(0, 5).map(({ el }) => ({
      xpath: el.xpath,
      cssSelector: el.cssSelector,
      tag: el.tag,
      rect: el.rect,
      depth: el.depth,
    })),
  };
}

function pickBestChange(
  changes: ElementChange[] | undefined
): ElementChange | undefined {
  if (!changes || changes.length === 0) return undefined;
  // Prefer style changes for the RCA panel since they're the most
  // human-interpretable — matches the Percy "Styles" view exactly.
  const styled = changes.find((c) => c.kind === "styled");
  if (styled) return styled;
  return changes[0];
}

function deltaNear(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5;
}

/** Block/flow spacing changes on an ancestor that typically shift descendants without their own style diff. */
const FLOW_LAYOUT_STYLED_PROPS = new Set([
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "gap",
]);

function ancestorHasFlowLayoutStyleChange(
  xpath: string,
  changeByXpath: Map<string, ElementChange[]>
): boolean {
  let xp: string | null = xpath;
  while ((xp = parentXpath(xp))) {
    const arr = changeByXpath.get(xp);
    if (!arr) continue;
    for (const ch of arr) {
      if (ch.kind !== "styled") continue;
      if (ch.styleDiff.some((e) => FLOW_LAYOUT_STYLED_PROPS.has(e.prop))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * An ancestor explains why this node only shows a pure shift: flow spacing
 * styled change, same-delta shift on a parent (grid moves as a block), or
 * resized container (e.g. body height) pushing descendants.
 */
function ancestorExplainsCollateralShift(
  xpath: string,
  selfShift: Extract<ElementChange, { kind: "shifted" }>,
  changeByXpath: Map<string, ElementChange[]>
): boolean {
  if (ancestorHasFlowLayoutStyleChange(xpath, changeByXpath)) return true;

  let xp: string | null = xpath;
  while ((xp = parentXpath(xp))) {
    const arr = changeByXpath.get(xp);
    if (!arr) continue;
    for (const ch of arr) {
      if (ch.kind === "resized") return true;
      if (ch.kind === "shifted" && deltaNear(ch.deltaXY, selfShift.deltaXY)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Pure layout shift from parent padding/margin/gap — pixels move but the element
 * has no own style change; RCA duplicates the ancestor's story (e.g. hero paragraph).
 */
function isCollateralShiftOnly(
  r: RegionAnalysis,
  changeByXpath: Map<string, ElementChange[]>
): boolean {
  const ps = r.primarySuspect;
  const ch = ps?.change;
  if (!ch || ch.kind !== "shifted" || !ps) return false;
  const list = changeByXpath.get(ps.xpath) ?? [];
  if (list.some((c) => c.kind === "styled")) return false;
  return ancestorExplainsCollateralShift(ps.xpath, ch, changeByXpath);
}

/** Keep regions that can show a concrete DOM diff in RCA (omit pixel-only noise). */
function regionHasActionableRca(r: RegionAnalysis): boolean {
  return r.primarySuspect?.change != null;
}

/**
 * For each diff region, pick the element that most likely caused it and
 * attach its DOM-level change (style/shift/resize/deleted/new). When no
 * change record exists for the chosen element, mark it as "visualOnly" —
 * the pixels differ but no tracked DOM property changed (e.g. parent
 * background bleeds into child area, or font rendering jitter).
 */
export function crossAnalyze(
  regions: Region[],
  baselineDom: ElementSnapshot[],
  currentDom: ElementSnapshot[],
  changes: ElementChange[],
  dpr: number
): {
  regions: RegionAnalysis[];
  unattributed: ElementChange[];
} {
  const changeByXpath = new Map<string, ElementChange[]>();
  for (const ch of changes) {
    const arr = changeByXpath.get(ch.xpath) ?? [];
    arr.push(ch);
    changeByXpath.set(ch.xpath, arr);
  }

  const xpathToCurrent = new Map<string, ElementSnapshot>();
  for (const el of currentDom) xpathToCurrent.set(el.xpath, el);

  const out: RegionAnalysis[] = [];

  regions.forEach((region, index) => {
    const cssRect = regionToCssRect(region, dpr);
    const ranked = rankElementsForRegion(cssRect, currentDom);

    if (ranked.length === 0) {
      const baseRanked = rankElementsForRegion(cssRect, baselineDom);
      if (baseRanked.length > 0) {
        const deepBase = baseRanked[0].el;
        const deep =
          xpathToCurrent.get(deepBase.xpath) ?? deepBase;
        out.push(
          buildRegionEntry(
            index,
            region,
            deep,
            baseRanked,
            changeByXpath,
            xpathToCurrent,
            dpr
          )
        );
        return;
      }
      out.push({ index, region, primarySuspect: null, candidates: [] });
      return;
    }

    const deep = ranked[0].el;
    out.push(
      buildRegionEntry(
        index,
        region,
        deep,
        ranked,
        changeByXpath,
        xpathToCurrent,
        dpr
      )
    );
  });

  const actionable = out.filter(regionHasActionableRca);
  const trimmed = actionable.filter(
    (r) => !isCollateralShiftOnly(r, changeByXpath)
  );
  const usedXpathsFinal = new Set<string>();
  for (const r of trimmed) {
    const xp = r.primarySuspect?.xpath;
    if (xp && r.primarySuspect?.change) usedXpathsFinal.add(xp);
  }
  const unattributed = changes.filter((c) => !usedXpathsFinal.has(c.xpath));
  const regionAnalyses = trimmed.map((r, i) => ({ ...r, index: i }));
  return { regions: regionAnalyses, unattributed };
}
