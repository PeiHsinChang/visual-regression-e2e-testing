import { test, expect } from "@playwright/test";
import { takeProjectSnapshot } from "../../src/sdk/index.ts";
import { dismissCookieBanner, waitForImagesLoaded } from "./helpers.ts";
import {
  CHECKOUT_PATH,
  addProductToCart,
  advanceToPayment,
  captureCheckoutState,
  fillGuestAddress,
  readCheckoutState,
  waitForCheckoutShippingReady,
} from "./checkout-a11y-helpers.ts";

// Ticket #247 — checkout section headings must be marked as headings.
// Baseline captures pre-fix state (div/span titles); current captures
// post-fix state (h2 titles). The state JSON's `headings[].tag` field
// diffs the change explicitly; pixel snapshots guard visual regression.
test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test.describe("brand-a checkout a11y — section headings (#247)", () => {
  test("shipping step — initial (empty address)", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await addProductToCart(page);
    await page.goto(CHECKOUT_PATH, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForCheckoutShippingReady(page);
    await dismissCookieBanner(page);
    await page.waitForTimeout(500);

    // Capture BEFORE asserting so baseline files land even on assert failure.
    const state = await readCheckoutState(page);
    await captureCheckoutState("brand-a-checkout-shipping-empty", state);
    await waitForImagesLoaded(page);
    await takeProjectSnapshot(page, testInfo, "brand-a-checkout-shipping-empty");
    expect(state.step).toBe("shipping");
    expect(state.visibleSections.shippingAddress).toBe(true);
    expect(state.headings.length).toBeGreaterThan(0);
  });

  test("shipping step — address filled + methods visible", async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    await addProductToCart(page);
    await page.goto(CHECKOUT_PATH, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForCheckoutShippingReady(page);
    await dismissCookieBanner(page);
    await fillGuestAddress(page);

    const state = await readCheckoutState(page);
    await captureCheckoutState("brand-a-checkout-shipping-filled", state);
    await waitForImagesLoaded(page);
    await takeProjectSnapshot(page, testInfo, "brand-a-checkout-shipping-filled");
    expect(state.formState.postcode).toBe("SW1A 1AA");
    expect(state.headings.length).toBeGreaterThan(0);
  });

  test("payment step — Ship To + Payment Method + Order Summary", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await addProductToCart(page);
    await page.goto(CHECKOUT_PATH, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForCheckoutShippingReady(page);
    await dismissCookieBanner(page);
    await fillGuestAddress(page);
    await advanceToPayment(page);

    const state = await readCheckoutState(page);
    await captureCheckoutState("brand-a-checkout-payment", state);
    await waitForImagesLoaded(page);
    await takeProjectSnapshot(page, testInfo, "brand-a-checkout-payment");
    expect(state.step).toBe("payment");
    expect(state.visibleSections.paymentMethods).toBe(true);
  });
});
