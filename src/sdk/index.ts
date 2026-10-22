import { promises as fs } from "node:fs";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import config from "../../vrt.config.ts";
import { serializeDom, type SerializeOptions } from "./serializeDom.ts";

const ROOT = process.cwd();

function hideSelectorsCSS(selectors: string[]): string {
  if (selectors.length === 0) return "";
  return `${selectors.join(", ")} { visibility: hidden !important; }`;
}

export type TakeSnapshotOptions = {
  /**
   * When set, included in filename as `<name>-<projectTag>-<w>x<h>`. Use
   * `test.info().project.name` to disambiguate the same viewport across
   * different browser projects (e.g. chromium vs safari at 1280x800).
   */
  projectTag?: string;
  /** Full-page screenshot (default false — viewport only). */
  fullPage?: boolean;
};

export async function takeSnapshot(
  page: Page,
  name: string,
  options: TakeSnapshotOptions = {}
): Promise<void> {
  const target = process.env.VRT_TARGET ?? "current";
  if (target !== "baseline" && target !== "current") {
    throw new Error(`Invalid VRT_TARGET: "${target}". Must be "baseline" or "current".`);
  }

  const brand = process.env.VRT_BRAND;
  if (!brand) {
    throw new Error(
      `VRT_BRAND is not set. Prefix your test command with VRT_BRAND=<brand> (e.g. brand-a, brand-b).`
    );
  }

  const outDir = path.join(ROOT, "screenshots", brand, target);
  await fs.mkdir(outDir, { recursive: true });

  // Empty `config.viewports` = use the page's current viewport (typically the
  // Playwright project's device viewport). Otherwise iterate the configured list.
  const viewports =
    config.viewports.length > 0
      ? config.viewports
      : [page.viewportSize() ?? { width: 1280, height: 720 }];

  for (const vp of viewports) {
    if (config.viewports.length > 0) await page.setViewportSize(vp);

    if (config.excludeSelectors.length > 0) {
      await page.addStyleTag({
        content: hideSelectorsCSS(config.excludeSelectors),
      });
    }

    await page.evaluate(() => {
      const fonts = (document as Document & { fonts?: { ready: Promise<void> } }).fonts;
      return fonts ? fonts.ready : Promise.resolve();
    });

    const png = await page.screenshot({ fullPage: options.fullPage ?? false });

    const dom = await page.evaluate(serializeDom, {
      excludeSelectors: config.excludeSelectors,
      computedStyleProps: config.computedStyleProps,
    } satisfies SerializeOptions);

    const suffix = options.projectTag ? `-${options.projectTag}` : "";
    const key = `${name}${suffix}-${vp.width}x${vp.height}`;
    const pngPath = path.join(outDir, `${key}.png`);
    const jsonPath = path.join(outDir, `${key}.json`);

    await fs.writeFile(pngPath, png);
    await fs.writeFile(
      jsonPath,
      JSON.stringify(
        {
          name,
          projectTag: options.projectTag ?? null,
          viewport: vp,
          devicePixelRatio: dom.dpr,
          elements: dom.elements,
        },
        null,
        2
      )
    );

    console.log(
      `[vrt] captured ${brand}/${target}/${key}  (${dom.elements.length} elements)`
    );
  }
}

/**
 * Convenience wrapper that pulls project name from Playwright's TestInfo
 * and passes it as projectTag. Also defaults to fullPage: true.
 */
export async function takeProjectSnapshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  extra: Omit<TakeSnapshotOptions, "projectTag"> = {}
): Promise<void> {
  await takeSnapshot(page, name, {
    projectTag: testInfo.project.name,
    fullPage: extra.fullPage ?? true,
  });
}
