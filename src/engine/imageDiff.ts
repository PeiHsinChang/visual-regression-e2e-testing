import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { compare } from "odiff-bin";
import { PNG } from "pngjs";

export type ImageDiffResult = {
  match: boolean;
  diffPixels: number;
  diffPercent: number;
  width: number;
  height: number;
  /** Mask PNG with transparent background and colored pixels for differences. */
  mask: PNG;
};

function readPng(filePath: string): Promise<PNG> {
  return new Promise((resolve, reject) => {
    const png = new PNG();
    createReadStream(filePath)
      .on("error", reject)
      .pipe(png)
      .on("parsed", () => resolve(png))
      .on("error", reject);
  });
}

/**
 * Compares two PNGs using odiff-bin and writes the diff mask to `outDiffPath`.
 * Returns the parsed mask so the caller can run region clustering on it.
 */
export async function imageDiff(
  baselinePath: string,
  currentPath: string,
  outDiffPath: string,
  threshold: number
): Promise<ImageDiffResult> {
  const basePng = await readPng(baselinePath);

  const result = await compare(baselinePath, currentPath, outDiffPath, {
    threshold,
    antialiasing: true,
    outputDiffMask: true,
    failOnLayoutDiff: false,
  });

  if (result.match) {
    // odiff writes nothing on exact match; report bundling still expects a
    // diff file path on disk (see generate.ts embedSnapshotImagesForHtml).
    const empty = new PNG({ width: basePng.width, height: basePng.height });
    await fs.writeFile(outDiffPath, Buffer.from(PNG.sync.write(empty)));
    return {
      match: true,
      diffPixels: 0,
      diffPercent: 0,
      width: basePng.width,
      height: basePng.height,
      mask: empty,
    };
  }

  if (result.reason === "layout-diff") {
    throw new Error(
      `Image dimensions differ between baseline and current: ${baselinePath} vs ${currentPath}`
    );
  }

  if (result.reason === "file-not-exists") {
    throw new Error(`File not found: ${result.file}`);
  }

  const mask = await readPng(outDiffPath);

  return {
    match: false,
    diffPixels: result.diffCount ?? 0,
    diffPercent: result.diffPercentage ?? 0,
    width: mask.width,
    height: mask.height,
    mask,
  };
}
