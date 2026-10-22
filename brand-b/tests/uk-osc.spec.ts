import { test } from "@playwright/test";
import { takeProjectSnapshot } from "../../src/sdk/index.ts";
import { addToCart } from "./helpers.ts";

test.describe("UK guest OSC", () => {
  test("checkout page — guest add-to-cart", async ({ page }, testInfo) => {
    test.setTimeout(180_000);

    await addToCart(page, {
      code: "uk",
      productPath: "/uk/i-bold-child-car-seat",
      productId: "734",
      superAttrKey: "93",
      superAttrVal: "256",
    });

    await page.goto("/uk/checkout/", { waitUntil: "load" });
    await page.waitForLoadState("networkidle").catch(() => {});
    // Safari (WebKit) needs ~10s for Hyva OSC to finish JS + CSS hydration.
    await page.waitForTimeout(10_000);

    await takeProjectSnapshot(page, testInfo, "uk-osc-checkout");
  });
});
