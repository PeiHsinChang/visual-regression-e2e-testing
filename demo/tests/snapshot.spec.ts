import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import { takeSnapshot } from "../../src/sdk/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const version = process.env.VRT_DEMO_VERSION ?? "v1";

test("homepage snapshot", async ({ page }) => {
  const filePath = path.resolve(__dirname, `../${version}/index.html`);
  await page.goto(`file://${filePath}`);
  await takeSnapshot(page, "home");
});
