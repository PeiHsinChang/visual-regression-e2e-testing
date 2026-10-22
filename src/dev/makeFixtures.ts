/**
 * Synthetic fixtures generator. Produces baseline + current snapshots that
 * mimic what the SDK would write, so we can validate the engine and report
 * pipeline without launching a real browser.
 *
 * Run with: pnpm exec tsx src/dev/makeFixtures.ts
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import type { ElementSnapshot, SnapshotFile } from "../engine/types.ts";

const ROOT = process.cwd();
const W = 1280;
const H = 720;

type FillRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  color: [number, number, number];
};

function fillPng(rects: FillRect[], baseColor: [number, number, number]): PNG {
  const png = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      png.data[idx] = baseColor[0];
      png.data[idx + 1] = baseColor[1];
      png.data[idx + 2] = baseColor[2];
      png.data[idx + 3] = 255;
    }
  }
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h && y < H; y++) {
      for (let x = r.x; x < r.x + r.w && x < W; x++) {
        if (x < 0 || y < 0) continue;
        const idx = (y * W + x) * 4;
        png.data[idx] = r.color[0];
        png.data[idx + 1] = r.color[1];
        png.data[idx + 2] = r.color[2];
        png.data[idx + 3] = 255;
      }
    }
  }
  return png;
}

function el(
  xpath: string,
  cssSelector: string,
  tag: string,
  rect: { x: number; y: number; w: number; h: number },
  computedStyle: Record<string, string>,
  depth: number
): ElementSnapshot {
  return { xpath, cssSelector, tag, rect, computedStyle, depth };
}

const BASE_BG_RGB = "rgb(245, 247, 250)";
const NEW_BG_RGB = "rgb(253, 246, 238)";
const BASE_NAV_GRADIENT = "linear-gradient(135deg, rgb(99, 102, 241), rgb(139, 92, 246))";
const NEW_NAV_GRADIENT = "linear-gradient(135deg, rgb(239, 68, 68), rgb(249, 115, 22))";
const BASE_CTA_BG = "rgb(59, 130, 246)";
const NEW_CTA_BG = "rgb(220, 38, 38)";

const baselineElements: ElementSnapshot[] = [
  el("/html[1]/body[1]", "body", "body", { x: 0, y: 0, w: W, h: H }, {
    backgroundColor: BASE_BG_RGB,
    color: "rgb(30, 41, 59)",
    fontSize: "16px",
  }, 1),
  el("/html[1]/body[1]/nav[1]", "nav.nav", "nav", { x: 0, y: 0, w: W, h: 56 }, {
    backgroundColor: BASE_NAV_GRADIENT,
    color: "rgb(255, 255, 255)",
    padding: "16px 32px",
    height: "56px",
  }, 2),
  el("/html[1]/body[1]/section[1]", "section.hero", "section", { x: 0, y: 56, w: W, h: 280 }, {
    padding: "80px 32px 48px",
    textAlign: "center",
  }, 2),
  el("/html[1]/body[1]/section[1]/h1[1]", "section.hero h1", "h1", { x: 220, y: 130, w: 840, h: 60 }, {
    fontSize: "48px",
    fontWeight: "700",
    color: "rgb(30, 41, 59)",
  }, 3),
  el("/html[1]/body[1]/section[1]/p[1]", "section.hero p", "p", { x: 280, y: 200, w: 720, h: 26 }, {
    fontSize: "18px",
    color: "rgb(100, 116, 139)",
  }, 3),
  el("/html[1]/body[1]/section[1]/button[1]", "button.cta", "button", { x: 580, y: 250, w: 120, h: 44 }, {
    backgroundColor: BASE_CTA_BG,
    color: "rgb(255, 255, 255)",
    padding: "12px 32px",
    borderRadius: "6px",
    fontSize: "16px",
    fontWeight: "600",
  }, 3),
  el("/html[1]/body[1]/div[1]", "div.cards", "div", { x: 128, y: 360, w: 1024, h: 240 }, {
    display: "grid",
    padding: "0 32px 80px",
  }, 2),
  el("/html[1]/body[1]/div[1]/div[1]", "div.card", "div", { x: 160, y: 376, w: 320, h: 200 }, {
    backgroundColor: "rgb(255, 255, 255)",
    padding: "24px",
    borderRadius: "8px",
  }, 3),
  el("/html[1]/body[1]/div[1]/div[2]", "div.card", "div", { x: 496, y: 376, w: 320, h: 200 }, {
    backgroundColor: "rgb(255, 255, 255)",
    padding: "24px",
    borderRadius: "8px",
  }, 3),
  el("/html[1]/body[1]/div[1]/div[3]", "div.card", "div", { x: 832, y: 376, w: 320, h: 200 }, {
    backgroundColor: "rgb(255, 255, 255)",
    padding: "24px",
    borderRadius: "8px",
  }, 3),
];

const currentElements: ElementSnapshot[] = baselineElements.map((b) => {
  const next: ElementSnapshot = {
    xpath: b.xpath,
    cssSelector: b.cssSelector,
    tag: b.tag,
    rect: { ...b.rect },
    computedStyle: { ...b.computedStyle },
    depth: b.depth,
  };
  if (b.cssSelector === "body") {
    next.computedStyle.backgroundColor = NEW_BG_RGB;
  }
  if (b.cssSelector === "nav.nav") {
    next.computedStyle.backgroundColor = NEW_NAV_GRADIENT;
  }
  if (b.cssSelector === "button.cta") {
    next.computedStyle.backgroundColor = NEW_CTA_BG;
    next.computedStyle.padding = "14px 36px";
    next.rect = { x: 572, y: 250, w: 136, h: 48 };
  }
  if (b.cssSelector === "section.hero h1") {
    next.computedStyle.fontSize = "52px";
    next.rect = { x: 200, y: 122, w: 880, h: 64 };
  }
  return next;
});

const baselinePng = fillPng(
  [
    { x: 0, y: 0, w: W, h: 56, color: [99, 102, 241] },
    { x: 580, y: 250, w: 120, h: 44, color: [59, 130, 246] },
  ],
  [245, 247, 250]
);

const currentPng = fillPng(
  [
    { x: 0, y: 0, w: W, h: 56, color: [239, 68, 68] },
    { x: 572, y: 250, w: 136, h: 48, color: [220, 38, 38] },
  ],
  [253, 246, 238]
);

async function writeSnapshot(
  target: "baseline" | "current",
  png: PNG,
  elements: ElementSnapshot[]
): Promise<void> {
  const dir = path.join(ROOT, "screenshots", "fixtures", target);
  await fs.mkdir(dir, { recursive: true });
  const key = `home-${W}x${H}`;
  const file: SnapshotFile = {
    name: "home",
    viewport: { width: W, height: H },
    devicePixelRatio: 1,
    elements,
  };
  await fs.writeFile(path.join(dir, `${key}.png`), PNG.sync.write(png));
  await fs.writeFile(
    path.join(dir, `${key}.json`),
    JSON.stringify(file, null, 2)
  );
  console.log(`[fixtures] wrote ${target}/${key}`);
}

async function main(): Promise<void> {
  await writeSnapshot("baseline", baselinePng, baselineElements);
  await writeSnapshot("current", currentPng, currentElements);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
