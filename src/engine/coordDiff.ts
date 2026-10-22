import type {
  ElementChange,
  ElementSnapshot,
  Rect,
  StyleDiffEntry,
} from "./types.ts";

const COORD_TOLERANCE = 1; // sub-pixel rounding tolerance

function rectsEqual(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) <= COORD_TOLERANCE &&
    Math.abs(a.y - b.y) <= COORD_TOLERANCE &&
    Math.abs(a.w - b.w) <= COORD_TOLERANCE &&
    Math.abs(a.h - b.h) <= COORD_TOLERANCE
  );
}

function sameSize(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.w - b.w) <= COORD_TOLERANCE &&
    Math.abs(a.h - b.h) <= COORD_TOLERANCE
  );
}

function diffStyles(
  before: Record<string, string>,
  after: Record<string, string>
): StyleDiffEntry[] {
  const out: StyleDiffEntry[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const b = before[key] ?? "";
    const a = after[key] ?? "";
    if (b !== a) out.push({ prop: key, before: b, after: a });
  }
  return out;
}

/**
 * Computed `background` is a shorthand that duplicates `backgroundColor` /
 * `backgroundImage`. Listing all three obscures the real paint delta (e.g.
 * body solid vs .card-icon solid) behind redundant rows.
 */
function collapseRedundantBackgroundShorthand(
  entries: StyleDiffEntry[]
): StyleDiffEntry[] {
  const props = new Set(entries.map((e) => e.prop));
  if (!props.has("background")) return entries;
  if (!props.has("backgroundImage") && !props.has("backgroundColor")) {
    return entries;
  }
  return entries.filter((e) => e.prop !== "background");
}

/**
 * Pair elements by xpath and emit one change per element that meaningfully
 * differs. The same element may appear in only one bucket; resized + shifted
 * are mutually exclusive (resized wins because it implies a layout-affecting
 * size change), and pure style changes are emitted independently when neither
 * shifted nor resized fires.
 */
export function diffCoords(
  baseline: ElementSnapshot[],
  current: ElementSnapshot[]
): ElementChange[] {
  const baseMap = new Map<string, ElementSnapshot>();
  for (const el of baseline) baseMap.set(el.xpath, el);
  const curMap = new Map<string, ElementSnapshot>();
  for (const el of current) curMap.set(el.xpath, el);

  const changes: ElementChange[] = [];

  for (const [xpath, b] of baseMap) {
    const c = curMap.get(xpath);
    if (!c) {
      changes.push({
        kind: "deleted",
        xpath,
        cssSelector: b.cssSelector,
        tag: b.tag,
        before: b.rect,
      });
      continue;
    }

    const equal = rectsEqual(b.rect, c.rect);
    const sizeOnly = !equal && sameSize(b.rect, c.rect);

    if (!equal && !sizeOnly) {
      changes.push({
        kind: "resized",
        xpath,
        cssSelector: c.cssSelector,
        tag: c.tag,
        before: b.rect,
        after: c.rect,
      });
    } else if (sizeOnly) {
      changes.push({
        kind: "shifted",
        xpath,
        cssSelector: c.cssSelector,
        tag: c.tag,
        before: b.rect,
        after: c.rect,
        deltaXY: [c.rect.x - b.rect.x, c.rect.y - b.rect.y],
      });
    }

    const styleDiff = collapseRedundantBackgroundShorthand(
      diffStyles(b.computedStyle, c.computedStyle)
    );
    if (styleDiff.length > 0) {
      changes.push({
        kind: "styled",
        xpath,
        cssSelector: c.cssSelector,
        tag: c.tag,
        rect: c.rect,
        styleDiff,
      });
    }
  }

  for (const [xpath, c] of curMap) {
    if (!baseMap.has(xpath)) {
      changes.push({
        kind: "new",
        xpath,
        cssSelector: c.cssSelector,
        tag: c.tag,
        after: c.rect,
      });
    }
  }

  return changes;
}
