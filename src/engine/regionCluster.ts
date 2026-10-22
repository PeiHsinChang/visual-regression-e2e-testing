import type { PNG } from "pngjs";
import type { Region } from "./types.ts";

export const REGION_MIN_DIM = 4;
export const REGION_MIN_AREA = 16;

/**
 * Build a binary mask from the diff PNG: any pixel with alpha > 0 is a diff.
 * odiff outputs transparent background + colored diff pixels when
 * `outputDiffMask` is true.
 */
function toBinaryMask(png: PNG): Uint8Array {
  const { width, height, data } = png;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const alpha = data[i * 4 + 3];
    if (alpha > 0) mask[i] = 1;
  }
  return mask;
}

/**
 * Cluster a binary diff mask into rectangular regions using BFS connected
 * components (4-connectivity). Tiny clusters are filtered out as noise.
 */
export function clusterRegions(mask: PNG): Region[] {
  const width = mask.width;
  const height = mask.height;
  const bin = toBinaryMask(mask);
  const visited = new Uint8Array(width * height);
  const regions: Region[] = [];

  // Reusable queue (avoids allocating many arrays).
  const queue = new Int32Array(width * height);

  for (let i = 0; i < bin.length; i++) {
    if (!bin[i] || visited[i]) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    visited[i] = 1;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let count = 0;

    while (head < tail) {
      const idx = queue[head++];
      const x = idx % width;
      const y = (idx / width) | 0;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      count++;

      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x < width - 1 ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y < height - 1 ? idx + width : -1,
      ];
      for (const n of neighbors) {
        if (n >= 0 && bin[n] && !visited[n]) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
    }

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;

    if (w < REGION_MIN_DIM || h < REGION_MIN_DIM || w * h < REGION_MIN_AREA)
      continue;

    regions.push({ x: minX, y: minY, w, h, pixelCount: count });
  }

  // Merge regions whose bounding boxes overlap or sit within 12px of each
  // other — small gaps between truly-related visual changes (e.g. text
  // glyphs) shouldn't fragment into many clickable boxes.
  return mergeNearbyRegions(regions, 12).sort(
    (a, b) => b.pixelCount - a.pixelCount
  );
}

function mergeNearbyRegions(regions: Region[], gap: number): Region[] {
  let changed = true;
  let current = regions.slice();
  while (changed) {
    changed = false;
    const merged: Region[] = [];
    const used = new Array<boolean>(current.length).fill(false);
    for (let i = 0; i < current.length; i++) {
      if (used[i]) continue;
      let acc = current[i];
      used[i] = true;
      for (let j = i + 1; j < current.length; j++) {
        if (used[j]) continue;
        if (rectsClose(acc, current[j], gap)) {
          acc = unionRect(acc, current[j]);
          used[j] = true;
          changed = true;
        }
      }
      merged.push(acc);
    }
    current = merged;
  }
  return current;
}

function rectsClose(a: Region, b: Region, gap: number): boolean {
  const aLeft = a.x - gap;
  const aRight = a.x + a.w + gap;
  const aTop = a.y - gap;
  const aBottom = a.y + a.h + gap;
  return !(
    b.x > aRight ||
    b.x + b.w < aLeft ||
    b.y > aBottom ||
    b.y + b.h < aTop
  );
}

function unionRect(a: Region, b: Region): Region {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w);
  const bottom = Math.max(a.y + a.h, b.y + b.h);
  return {
    x,
    y,
    w: right - x,
    h: bottom - y,
    pixelCount: a.pixelCount + b.pixelCount,
  };
}
