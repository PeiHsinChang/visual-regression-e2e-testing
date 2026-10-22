import { test, expect, type Page } from "@playwright/test";
import { dismissCookieBanner } from "./helpers.ts";
import {
  CHECKOUT_PATH,
  advanceToPayment,
  fillGuestAddress,
  readCheckoutState,
  waitForCheckoutShippingReady,
} from "./checkout-a11y-helpers.ts";

const PDP_PATH = "/uk/test-product-3";

// Robust add-to-cart for the Logico L configurable PDP. The shared
// addProductToCart helper races swatch hydration — networkidle + an explicit
// swatch wait + a post-add cart poll make this reliable.
async function addToCartReliably(page: Page): Promise<void> {
  await page.goto(PDP_PATH, { waitUntil: "networkidle", timeout: 45_000 });
  await page.waitForSelector("#product-addtocart-button", { timeout: 20_000 });
  await page.waitForSelector(".swatch-option", { timeout: 15_000 }).catch(() => {});

  // Click first available swatch so super_attribute hidden input is populated
  // (the PDP preselects it, but clicking also wires up any dependent qty/EAN).
  const firstSwatch = page.locator(".swatch-option:not(.disabled):not(.out-of-stock)").first();
  if (await firstSwatch.count()) {
    await firstSwatch.click();
    await page.waitForTimeout(400);
  }

  await Promise.all([
    page
      .waitForResponse((r) => /\/checkout\/cart\/add/.test(r.url()) && r.status() < 500, {
        timeout: 20_000,
      })
      .catch(() => null),
    page.click("#product-addtocart-button"),
  ]);

  // Poll the customer-data endpoint until the server-side cart confirms the
  // item landed. /checkout/cart/add can return 200 before the quote persists.
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const count = await page.evaluate(async () => {
      const r = await fetch(
        "/uk/customer/section/load/?sections=cart&force_new_section_timestamp=true",
        { headers: { Accept: "application/json" } }
      );
      const j = await r.json();
      return (j?.cart?.summary_count as number) ?? 0;
    });
    if (count > 0) return;
    await page.waitForTimeout(500);
  }
  throw new Error("Cart stayed empty after add-to-cart POST");
}

// Shipping address — used by fillGuestAddress for the top-of-page form.
// Mirrors GUEST_ADDRESS in checkout-a11y-helpers.ts (SW1A 1AA / London).
// Billing address below is intentionally different (Manchester / M1 1AE)
// so assertions can confirm the per-payment billing form actually overrode
// "same as shipping" and persisted its own values.
const BILLING_ADDRESS = {
  firstname: "Billing",
  lastname: "Different",
  street: "99 Billing Street",
  city: "Manchester",
  postcode: "M1 1AE",
  telephone: "07700900111",
} as const;

// Expand the active payment method's billing form, fill a different address,
// click Update, and wait for the method's _active state + the collapsed
// billing-address-details to reflect the new values.
async function fillDifferentBillingAddress(page: Page): Promise<void> {
  const activeGroup = page.locator(".payment-method._active").first();
  await activeGroup.waitFor({ state: "visible", timeout: 15_000 });

  // The checkbox has `data-bind="checked: isAddressSameAsShipping, click:
  // useShippingAddress"`. A plain user-level click does nothing user-visible
  // (the click handler eats it). Setting `checked=false` + dispatching both
  // `change` and `click` drives the KO observable AND the method's own
  // handler, which is what expands the per-method billing fieldset.
  await activeGroup
    .locator('input[name="billing-address-same-as-shipping"]')
    .first()
    .evaluate((el: HTMLInputElement) => {
      if (!el.checked) return;
      el.checked = false;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("click", { bubbles: true }));
    });

  // Poll for the fieldset actually painting (bounding width > 0), rather
  // than `waitFor state=visible` which races the KO re-render.
  const form = activeGroup.locator(".billing-address-form").first();
  await page.waitForFunction(
    () => {
      const active = document.querySelector(".payment-method._active");
      const inp = active?.querySelector<HTMLInputElement>(
        '.billing-address-form input[name="firstname"]'
      );
      return !!inp && inp.getBoundingClientRect().width > 0;
    },
    { timeout: 10_000 }
  );

  await form.locator('input[name="firstname"]').fill(BILLING_ADDRESS.firstname);
  await form.locator('input[name="lastname"]').fill(BILLING_ADDRESS.lastname);
  await form.locator('input[name="street[0]"]').fill(BILLING_ADDRESS.street);
  await form.locator('input[name="city"]').fill(BILLING_ADDRESS.city);
  await form.locator('input[name="postcode"]').fill(BILLING_ADDRESS.postcode);
  await form.locator('input[name="telephone"]').fill(BILLING_ADDRESS.telephone);
  await form.locator('input[name="telephone"]').blur();
  await page.waitForTimeout(300);

  await Promise.all([
    page
      .waitForResponse(
        (r) => /\/payment-information|\/set-payment-information/.test(r.url()) && r.status() < 500,
        { timeout: 15_000 }
      )
      .catch(() => null),
    activeGroup.locator("button.action-update, .action.action-update").first().click(),
  ]);

  // After Update, the form collapses and `.billing-address-details` renders
  // the new address inside the same payment-method group.
  await activeGroup
    .locator(".billing-address-details")
    .waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(500);
}

// Flow: guest PDP -> add to cart -> checkout -> fill shipping -> select method
//       -> expand billing form -> fill DIFFERENT billing address -> Update
//       -> assert review state is consistent.
// Does NOT place the order (test env side-effects stay zero).

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test.describe("brand-a UK checkout — guest flow to review", () => {
  test("guest can reach payment review with valid summary + place-order enabled", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await addToCartReliably(page);

    await page.goto(CHECKOUT_PATH, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForCheckoutShippingReady(page);
    await dismissCookieBanner(page);

    await fillGuestAddress(page);
    await advanceToPayment(page);

    // Store exposes multiple payment methods (Stripe + PayPal + …); the
    // KO viewmodel does not auto-select one, so pick the first visible radio.
    const firstPayment = page.locator('input[name="payment[method]"]').first();
    await firstPayment.waitFor({ state: "attached", timeout: 15_000 });
    await firstPayment.check({ force: true }).catch(() => {});
    await page.waitForTimeout(800);

    await fillDifferentBillingAddress(page);

    // The collapsed billing-address-details block renders the new address;
    // assert the Manchester postcode landed to prove override took effect.
    const billingDetails = page
      .locator(".payment-method._active .billing-address-details")
      .first();
    await expect(billingDetails).toContainText(BILLING_ADDRESS.postcode);
    await expect(billingDetails).toContainText(BILLING_ADDRESS.city);
    await expect(billingDetails).toContainText(BILLING_ADDRESS.firstname);
    // Negative check: the shipping postcode (SW1A 1AA) must NOT appear in the
    // billing block, otherwise "same as shipping" silently stayed on.
    await expect(billingDetails).not.toContainText("SW1A 1AA");

    const state = await readCheckoutState(page);

    expect(state.step).toBe("payment");
    expect(state.visibleSections.paymentMethods).toBe(true);
    expect(state.visibleSections.shipTo).toBe(true);

    expect(state.formState.shippingMethodChecked).toBeTruthy();
    expect(state.formState.paymentMethodChecked).toBeTruthy();

    // Grand total + line-item count are the real business guarantees — the
    // sidebar's exact DOM location moves between shipping/payment steps on
    // this site, so assert on the values, not on container visibility.
    expect(state.orderSummary.itemCount).toBe(1);
    expect(state.orderSummary.grandTotal ?? "").toMatch(/£\s?\d/);

    expect(state.buttons.placeOrderVisible).toBe(true);
    expect(state.buttons.placeOrderEnabled).toBe(true);
  });
});
