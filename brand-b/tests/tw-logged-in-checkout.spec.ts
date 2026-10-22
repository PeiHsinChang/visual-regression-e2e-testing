import { test } from "@playwright/test";
import { takeProjectSnapshot } from "../../src/sdk/index.ts";
import { addToCart, clearCartViaRest, loginViaStorefront } from "./helpers.ts";

test.describe("TW logged-in OSC", () => {
  test("checkout page — logged-in customer", async ({ page }, testInfo) => {
    test.setTimeout(240_000);

    await loginViaStorefront(page, "tw");
    // Persistent cart accumulates across runs — clear so the snapshot only has our product.
    await clearCartViaRest(page, "tw");
    await addToCart(page, {
      code: "tw",
      productPath: "/tw/bold",
      productId: "412",
      superAttrKey: "93",
      superAttrVal: "25",
    });

    await page.goto("/tw/checkout/", { waitUntil: "load" });
    await page.waitForLoadState("networkidle").catch(() => {});
    // Safari (WebKit) needs ~10s for Hyva OSC to finish JS + CSS hydration
    // (KO checkout + tailwind); 4s produces an unstyled "big broken layout".
    await page.waitForTimeout(10_000);

    await takeProjectSnapshot(page, testInfo, "tw-logged-in-checkout");
  });
});
