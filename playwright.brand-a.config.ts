import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv({ path: path.resolve(__dirname, "brand-a/.env") });

const baseURL = process.env.BASE_URL ?? "https://brand-a.local.test";
// SLOW_MO=<ms> adds a delay between every Playwright action (debug aid).
// Also forces headed mode so you can actually watch — pointless slowing a
// headless run. CI leaves SLOW_MO unset, so this is a no-op there.
const slowMo = Number(process.env.SLOW_MO ?? 0);

export default defineConfig({
  testDir: "./brand-a/tests",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    headless: slowMo > 0 ? false : true,
    ignoreHTTPSErrors: true,
    launchOptions: { slowMo },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
