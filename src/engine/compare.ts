import { promises as fs } from "node:fs";
import path from "node:path";
import config from "../../vrt.config.ts";
import { diffCoords } from "./coordDiff.ts";
import { crossAnalyze } from "./crossAnalysis.ts";
import { imageDiff } from "./imageDiff.ts";
import { clusterRegions } from "./regionCluster.ts";
import { splitRegionsByChangedElements } from "./regionSplit.ts";
import type { CompareResult, ReportData, SnapshotFile } from "./types.ts";

const ROOT = process.cwd();
const SCREENSHOTS_DIR = path.join(ROOT, "screenshots");
const REPORTS_DIR = path.join(ROOT, "reports");

function timestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace(/Z$/, "");
}

async function listBrands(): Promise<string[]> {
  try {
    const entries = await fs.readdir(SCREENSHOTS_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function listSnapshots(
  brand: string,
  target: "baseline" | "current"
): Promise<string[]> {
  const dir = path.join(SCREENSHOTS_DIR, brand, target);
  try {
    const files = await fs.readdir(dir);
    return files.filter((f) => f.endsWith(".png")).map((f) => f.replace(/\.png$/, ""));
  } catch {
    return [];
  }
}

export async function runCompare(): Promise<{
  reportDir: string;
  data: ReportData;
}> {
  const brandFilter = process.env.VRT_BRAND;
  const allBrands = await listBrands();
  const brands = brandFilter
    ? allBrands.filter((b) => b === brandFilter)
    : allBrands;

  if (brands.length === 0) {
    throw new Error(
      brandFilter
        ? `No snapshots for brand "${brandFilter}" under screenshots/.`
        : "No brand folders found under screenshots/. Run capture first."
    );
  }

  const brandPairs = await Promise.all(
    brands.map(async (brand) => ({
      brand,
      baselineKeys: await listSnapshots(brand, "baseline"),
      currentKeys: await listSnapshots(brand, "current"),
    }))
  );

  const activeBrands = brandPairs.filter(
    (b) => b.baselineKeys.length > 0 && b.currentKeys.length > 0
  );
  if (activeBrands.length === 0) {
    throw new Error(
      "No brand has both baseline and current snapshots to compare."
    );
  }

  const buildId = timestamp();
  const reportDir = path.join(REPORTS_DIR, buildId);
  const imagesDir = path.join(reportDir, "images");
  await fs.mkdir(imagesDir, { recursive: true });

  const snapshots: CompareResult[] = [];

  for (const { brand, baselineKeys, currentKeys } of activeBrands) {
    const sharedKeys = baselineKeys.filter((k) => currentKeys.includes(k));
    if (sharedKeys.length === 0) {
      console.warn(
        `[vrt] ${brand}: no snapshot names overlap between baseline and current — skipping.`
      );
      continue;
    }

    for (const key of sharedKeys) {
      const baselinePng = path.join(SCREENSHOTS_DIR, brand, "baseline", `${key}.png`);
      const currentPng = path.join(SCREENSHOTS_DIR, brand, "current", `${key}.png`);
      const baselineJson = path.join(SCREENSHOTS_DIR, brand, "baseline", `${key}.json`);
      const currentJson = path.join(SCREENSHOTS_DIR, brand, "current", `${key}.json`);

      const [baselineDom, currentDom] = (await Promise.all([
        fs.readFile(baselineJson, "utf8").then(JSON.parse),
        fs.readFile(currentJson, "utf8").then(JSON.parse),
      ])) as [SnapshotFile, SnapshotFile];

      const reportBaseline = path.join(imagesDir, `${key}-baseline.png`);
      const reportCurrent = path.join(imagesDir, `${key}-current.png`);
      const reportDiff = path.join(imagesDir, `${key}-diff.png`);
      await fs.copyFile(baselinePng, reportBaseline);
      await fs.copyFile(currentPng, reportCurrent);

      const result = await imageDiff(
        baselinePng,
        currentPng,
        reportDiff,
        config.diffThreshold
      );

      const regions = result.match ? [] : clusterRegions(result.mask);
      const changes = diffCoords(baselineDom.elements, currentDom.elements);
      const dpr = currentDom.devicePixelRatio || 1;
      const splitRegions = result.match
        ? []
        : splitRegionsByChangedElements(
            regions,
            changes,
            currentDom.elements,
            dpr,
            result.mask
          );
      const cross = crossAnalyze(
        splitRegions,
        baselineDom.elements,
        currentDom.elements,
        changes,
        dpr
      );

      // Always POSIX-style paths for web (img.src / fetch). path.join would use
      // backslashes on Windows and break <img> URLs.
      snapshots.push({
        snapshot: key,
        viewport: currentDom.viewport,
        devicePixelRatio: dpr,
        baselineImage: `images/${key}-baseline.png`,
        currentImage: `images/${key}-current.png`,
        diffImage: `images/${key}-diff.png`,
        imageWidth: result.width,
        imageHeight: result.height,
        diffPixels: result.diffPixels,
        diffPercent: result.diffPercent,
        regions: cross.regions,
        unattributedChanges: cross.unattributed,
      });

      console.log(
        `[vrt] compared ${brand}/${key}: ${result.diffPixels} diff px (${result.diffPercent.toFixed(2)}%), ${splitRegions.length} regions (${regions.length} raw clusters), ${changes.length} DOM changes`
      );
    }
  }

  const data: ReportData = {
    buildId,
    generatedAt: new Date().toISOString(),
    snapshots,
  };

  return { reportDir, data };
}
