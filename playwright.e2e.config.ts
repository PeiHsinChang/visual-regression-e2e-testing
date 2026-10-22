import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src/e2e/features",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: {
    headless: true,
    ignoreHTTPSErrors: true,
    navigationTimeout: 45_000,
    actionTimeout: 10_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
