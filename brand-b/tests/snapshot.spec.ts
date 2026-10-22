import { test } from "@playwright/test";
import { takeSnapshot } from "../../src/sdk/index.ts";

test("brand-b forgot password page snapshot", async ({ page }) => {
  await page.goto("https://brand-b.local.test/uk/customer/account/forgotpassword/", {
    waitUntil: "networkidle",
  });
  await takeSnapshot(page, "brand-b-forgotpassword");
});
