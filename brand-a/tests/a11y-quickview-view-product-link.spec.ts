import { test, expect } from "@playwright/test";
import { dismissCookieBanner } from "./helpers.ts";

// Ticket #197 — A360 P1 a11y (WCAG 2.1.1)
//
// Bug: on PLP Quick View, the "View product information" link inside the modal
//   has tabindex="-1" so keyboard users cannot Tab to the (only) call-to-action
//   that opens the full PDP from the Quick View iframe.
//
// Template: app/design/frontend/Vendor/brandAEcom/Magento_Catalog/templates/product/view/product_link.phtml
// It is rendered in two contexts (both inherit catalog_product_view layout):
//   1. Standalone PDP                → the wrapper `.view-product-link` is hidden by CSS
//      (`display: none` under `.catalog-product-view`), so removing tabindex="-1" is
//      safe — a display:none element is already out of tab order.
//   2. Amasty Quick View iframe      → the wrapper is visible; link MUST be reachable
//      via Tab (it's the meaningful "go to full PDP" affordance from the modal).
//
// Amasty implementation: the QuickView iframe is just the PDP URL with
// `?amasty_quickview=1`, which adds the `amasty_quickview_ajax_view` layout
// handle. So we can validate the rendered HTML directly by hitting that URL —
// no UI dance with fancybox required, and no dev-env flakiness on the trigger.

const PDP_PATH = "/uk/test-product-3";
const QUICKVIEW_PATH = `${PDP_PATH}?amasty_quickview=1`;
const VIEW_PRODUCT_LINK = ".view-product-link a.product.photo.product-item-photo";

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test.describe("a11y #197 — Quick View 'View product information' tab order", () => {
  test("Quick View context: link is keyboard-reachable (no tabindex=-1)", async ({ page }) => {
    test.setTimeout(45_000);

    await page.goto(QUICKVIEW_PATH, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await dismissCookieBanner(page);

    const link = page.locator(VIEW_PRODUCT_LINK).first();
    await expect(link, "product_link.phtml must render in Quick View context").toHaveCount(1);

    // === Assertion 1: DOM — tabindex must NOT be -1 ===
    const tabindex = await link.getAttribute("tabindex");
    expect(
      tabindex,
      `Quick View 'View product information' link must not be out of tab order (got tabindex="${tabindex}")`
    ).not.toBe("-1");

    // === Assertion 2: link points at real PDP ===
    const href = await link.getAttribute("href");
    expect(href, "link should carry a PDP href").toBeTruthy();
    expect(href!).toMatch(/^https?:\/\/|^\//);

    // === Assertion 3: functional — element is actually focusable by Tab ===
    // A reachable link should return a non-negative tabIndex from the DOM API.
    // (Elements with tabindex="-1" report -1; missing/removed attribute → 0 for <a href>.)
    const tabIndexProp = await link.evaluate((el) => (el as HTMLElement).tabIndex);
    expect(
      tabIndexProp,
      "HTMLElement.tabIndex should be >= 0 when the link is in normal tab order"
    ).toBeGreaterThanOrEqual(0);
  });

  test("PDP context: wrapper stays display:none (regression guard for PDP tab flow)", async ({ page }) => {
    test.setTimeout(30_000);

    await page.goto(PDP_PATH, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await dismissCookieBanner(page);

    const wrapper = page.locator(".view-product-link").first();
    await expect(wrapper, "product_link.phtml wrapper must render on PDP").toHaveCount(1);

    // The CSS rule `.catalog-product-view .view-product-link { display: none; }`
    await expect(
      wrapper,
      "On PDP the wrapper must remain hidden — this is what keeps the duplicate self-link out of tab order after the a11y fix removes tabindex"
    ).toBeHidden();
  });
});
