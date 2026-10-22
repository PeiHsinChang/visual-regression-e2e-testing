import { test, expect } from "@playwright/test";
import { takeProjectSnapshot } from "../../src/sdk/index.ts";
import { addToCart } from "./helpers.ts";

test.describe("TW guest — auth popup on checkout intent", () => {
  test("popup opens when guest clicks 結帳", async ({ page }, testInfo) => {
    test.setTimeout(180_000);

    await addToCart(page, {
      code: "tw",
      productPath: "/tw/bold",
      productId: "412",
      superAttrKey: "93",
      superAttrVal: "25",
    });

    await page.goto("/tw/checkout/cart/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    // TW has guest checkout disabled → clicking 結帳 opens the auth popup
    // (see Magento_Customer/templates/account/authentication-popup.phtml).
    await page.locator("#checkout-link-button").click();

    const popup = page.locator("#authentication-popup");
    await expect(popup).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(600); // finish open transition

    await takeProjectSnapshot(page, testInfo, "tw-guest-login-popup");
  });
});
