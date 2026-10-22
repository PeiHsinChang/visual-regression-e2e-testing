export type Rect = { x: number; y: number; w: number; h: number };

export type Region = {
  x: number;
  y: number;
  w: number;
  h: number;
  pixelCount: number;
};

export type ElementSnapshot = {
  xpath: string;
  cssSelector: string;
  tag: string;
  rect: Rect;
  computedStyle: Record<string, string>;
  depth: number;
};

export type SnapshotFile = {
  name: string;
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  elements: ElementSnapshot[];
};

export type StyleDiffEntry = { prop: string; before: string; after: string };

export type ElementChange =
  | {
      kind: "shifted";
      xpath: string;
      cssSelector: string;
      tag: string;
      before: Rect;
      after: Rect;
      deltaXY: [number, number];
    }
  | {
      kind: "resized";
      xpath: string;
      cssSelector: string;
      tag: string;
      before: Rect;
      after: Rect;
    }
  | {
      kind: "styled";
      xpath: string;
      cssSelector: string;
      tag: string;
      rect: Rect;
      styleDiff: StyleDiffEntry[];
    }
  | {
      kind: "deleted";
      xpath: string;
      cssSelector: string;
      tag: string;
      before: Rect;
    }
  | {
      kind: "new";
      xpath: string;
      cssSelector: string;
      tag: string;
      after: Rect;
    };

export type RegionAnalysis = {
  index: number;
  region: Region;
  /**
   * When set, the overlay draws this bbox (image px) instead of `region` —
   * e.g. promote a text-only diff cluster to the surrounding `div.card` that
   * moved with the same delta as its children.
   */
  displayRegion?: Region;
  primarySuspect: {
    xpath: string;
    cssSelector: string;
    tag: string;
    rect: Rect;
    change?: ElementChange;
    visualOnly: boolean;
  } | null;
  candidates: {
    xpath: string;
    cssSelector: string;
    tag: string;
    rect: Rect;
    depth: number;
  }[];
};

export type CompareResult = {
  snapshot: string;
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  baselineImage: string;
  currentImage: string;
  diffImage: string;
  imageWidth: number;
  imageHeight: number;
  diffPixels: number;
  diffPercent: number;
  regions: RegionAnalysis[];
  unattributedChanges: ElementChange[];
};

export type ReportData = {
  buildId: string;
  generatedAt: string;
  snapshots: CompareResult[];
};
