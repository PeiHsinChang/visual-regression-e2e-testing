import { promises as fs } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

const ROOT = process.cwd();

export const CHECKOUT_PATH = "/uk/checkout/";
export const PDP_PATH = "/uk/test-product-3";

// Guest address that passes UK checkout validation. Email is time-stamped so
// repeat runs don't collide on any "email already registered" state.
export const GUEST_ADDRESS = {
  firstname: "VRT",
  lastname: "Test",
  street: "1 Test Road",
  city: "London",
  postcode: "SW1A 1AA",
  telephone: "07700900000",
} as const;

export function guestEmail(): string {
  return `vrt-checkout-${Date.now()}@example.com`;
}

// One heading candidate = the pre-fix div/span OR post-fix h2 that a #247
// selector matches. `tag` is what the diff cares about.
export type HeadingInventoryItem = {
  selector: string;
  tag: string;
  ariaLevel: string | null;
  text: string;
  className: string;
  dataRole: string | null;
  visible: boolean;
};

export type CheckoutState = {
  step: "shipping" | "payment" | "unknown";
  headings: HeadingInventoryItem[];
  visibleSections: {
    shippingAddress: boolean;
    shippingMethods: boolean;
    orderSummary: boolean;
    paymentMethods: boolean;
    shipTo: boolean;
    socialLogin: boolean;
  };
  formState: {
    customerEmail: string | null;
    firstname: string | null;
    postcode: string | null;
    shippingMethodChecked: string | null;
    paymentMethodChecked: string | null;
  };
  buttons: {
    continueVisible: boolean;
    placeOrderVisible: boolean;
    placeOrderEnabled: boolean;
  };
  orderSummary: {
    subtotal: string | null;
    shipping: string | null;
    grandTotal: string | null;
    itemCount: number;
  };
};

// Read the a11y-relevant checkout state. Headings inventory tracks tag changes
// for #247; the other groups guard against JS-behaviour / cascade regressions.
export async function readCheckoutState(page: Page): Promise<CheckoutState> {
  return page.evaluate(() => {
    const HEADING_SELECTORS = [
      ".opc-wrapper .step-title",
      "#opc-sidebar .opc-block-summary > .title",
      ".shipping-information-title > *:first-child",
      ".amsl-title",
    ];
    const seen = new Set<Element>();
    const headings: any[] = [];
    const isVisible = (el: Element | null): boolean => {
      if (!el) return false;
      const cs = getComputedStyle(el as HTMLElement);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      const rects = (el as HTMLElement).getClientRects();
      return rects.length > 0;
    };
    for (const sel of HEADING_SELECTORS) {
      document.querySelectorAll(sel).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        headings.push({
          selector: sel,
          tag: el.tagName.toLowerCase(),
          ariaLevel: el.getAttribute("aria-level"),
          text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 120),
          className: (el.className || "").toString().trim(),
          dataRole: el.getAttribute("data-role"),
          visible: isVisible(el),
        });
      });
    }
    // Deterministic order so JSON diff is stable
    headings.sort((a, b) => {
      const ka = a.selector + "|" + a.text;
      const kb = b.selector + "|" + b.text;
      return ka.localeCompare(kb);
    });

    const q = <T extends Element = Element>(s: string) => document.querySelector<T>(s);
    const emailInput = q<HTMLInputElement>("#customer-email");
    const firstnameInput = q<HTMLInputElement>('input[name="firstname"]');
    const postcodeInput = q<HTMLInputElement>('input[name="postcode"]');
    const shippingRadio = q<HTMLInputElement>(
      '.table-checkout-shipping-method input[type="radio"]:checked'
    );
    const paymentRadio = q<HTMLInputElement>('input[name="payment[method]"]:checked');
    const placeOrder = q<HTMLButtonElement>("button.action.primary.checkout");
    const continueBtn = q<HTMLButtonElement>('button[data-role="opc-continue"]');

    return {
      step: (() => {
        if (isVisible(q(".checkout-payment-method"))) return "payment" as const;
        if (isVisible(q("#checkout-step-shipping"))) return "shipping" as const;
        return "unknown" as const;
      })(),
      headings,
      visibleSections: {
        shippingAddress: isVisible(q(".checkout-shipping-address")),
        shippingMethods: isVisible(q("#checkout-step-shipping_method .step-content")),
        orderSummary: isVisible(q("#opc-sidebar .opc-block-summary")),
        paymentMethods: isVisible(q(".checkout-payment-method")),
        shipTo: isVisible(q(".shipping-information-title")),
        socialLogin: isVisible(q(".amsl-title")),
      },
      formState: {
        customerEmail: emailInput?.value ?? null,
        firstname: firstnameInput?.value ?? null,
        postcode: postcodeInput?.value ?? null,
        shippingMethodChecked: shippingRadio?.value ?? null,
        paymentMethodChecked: paymentRadio?.value ?? null,
      },
      buttons: {
        continueVisible: isVisible(continueBtn),
        placeOrderVisible: isVisible(placeOrder),
        placeOrderEnabled: !!placeOrder && !placeOrder.disabled,
      },
      orderSummary: {
        subtotal: q(".totals.sub .amount .price")?.textContent?.trim() ?? null,
        shipping: q(".totals.shipping .amount .price")?.textContent?.trim() ?? null,
        grandTotal: q(".grand.totals .amount .price")?.textContent?.trim() ?? null,
        itemCount: document.querySelectorAll(".minicart-items .product-item").length,
      },
    };
  });
}

// Add the Logico L PDP (same fixture as color-swatch.spec.ts) to a guest cart.
// Cart persists on the browser context via the guest cart cookie.
export async function addProductToCart(page: Page): Promise<void> {
  await page.goto(PDP_PATH, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#product-addtocart-button", { timeout: 20_000 });
  const firstSwatch = page.locator(".swatch-option:not(.disabled):not(.out-of-stock)").first();
  if (await firstSwatch.count()) {
    await firstSwatch.click();
    await page.waitForTimeout(400);
  }
  await Promise.all([
    page
      .waitForResponse(
        (res) => /\/checkout\/cart\/add/.test(res.url()) && res.status() < 500,
        { timeout: 15_000 }
      )
      .catch(() => null),
    page.click("#product-addtocart-button"),
  ]);
  await page.waitForTimeout(1500);
}

// Checkout shipping-step DOM is populated by KO after Ajax. Wait for the
// initial loader to hide, then for the specific summary + shipping form
// containers to attach. `.opc-block-summary` alone is ambiguous on this site:
// Mageside SubscribeAtCheckout and Dotdigital SMS consent both reuse the class
// on unrelated fields — narrow with #opc-sidebar to hit the real Order Summary.
export async function waitForCheckoutShippingReady(page: Page): Promise<void> {
  // Loader element is REMOVED (not just display:none) once KO app finishes
  // bootstrapping on this site; null = ready.
  await page
    .waitForFunction(
      () => {
        const l = document.querySelector<HTMLElement>("#checkout-loader");
        return !l || getComputedStyle(l).display === "none";
      },
      { timeout: 30_000 }
    )
    .catch(() => {});
  await page.waitForSelector(".checkout-shipping-address .step-title", {
    state: "attached",
    timeout: 25_000,
  });
  await page
    .waitForSelector("#opc-sidebar .opc-block-summary", { state: "attached", timeout: 25_000 })
    .catch(() => {});
  await page
    .waitForSelector("#customer-email", { state: "attached", timeout: 20_000 })
    .catch(() => {});
  await page.waitForTimeout(1000);
}

// Fill guest shipping address. Waits for the shipping-methods estimate call
// so `state.visibleSections.shippingMethods` will be true after this returns.
export async function fillGuestAddress(page: Page): Promise<void> {
  const email = guestEmail();
  await page.fill("#customer-email", email);
  await page.waitForTimeout(400);
  await page.fill('input[name="firstname"]', GUEST_ADDRESS.firstname);
  await page.fill('input[name="lastname"]', GUEST_ADDRESS.lastname);
  await page.fill('input[name="street[0]"]', GUEST_ADDRESS.street);
  await page.fill('input[name="city"]', GUEST_ADDRESS.city);
  await page.fill('input[name="postcode"]', GUEST_ADDRESS.postcode);
  await page.fill('input[name="telephone"]', GUEST_ADDRESS.telephone);

  // Region: some stores render a select, others a free text input. Pick any
  // non-empty option when a select is present.
  const regionSelect = page.locator('select[name="region_id"]');
  if ((await regionSelect.count()) && (await regionSelect.isVisible().catch(() => false))) {
    const val = await regionSelect.evaluate((el: HTMLSelectElement) => {
      const opt = Array.from(el.options).find((o) => o.value && o.value !== "");
      return opt?.value ?? "";
    });
    if (val) await regionSelect.selectOption(val);
  }

  // Blur last field so KO validators + estimate call fire
  await page.locator('input[name="telephone"]').blur();
  await page
    .waitForResponse(
      (r) => /estimate-shipping-methods/.test(r.url()) && r.status() < 500,
      { timeout: 20_000 }
    )
    .catch(() => {});
  await page
    .waitForSelector('.table-checkout-shipping-method input[type="radio"]', { timeout: 15_000 })
    .catch(() => {});
  await page.waitForTimeout(500);
}

// Select first shipping method and continue to payment step.
export async function advanceToPayment(page: Page): Promise<void> {
  const firstRadio = page.locator('.table-checkout-shipping-method input[type="radio"]').first();
  await firstRadio.check().catch(() => {});
  await page.waitForTimeout(300);
  await Promise.all([
    page
      .waitForResponse(
        (r) => /\/shipping-information/.test(r.url()) && r.status() < 500,
        { timeout: 20_000 }
      )
      .catch(() => null),
    page.click('button[data-role="opc-continue"]'),
  ]);
  await page
    .waitForSelector(".checkout-payment-method", { state: "visible", timeout: 20_000 })
    .catch(() => {});
  await page
    .waitForSelector(".shipping-information-title", { state: "visible", timeout: 10_000 })
    .catch(() => {});
  // Payment groups (title + method radios + per-method billing form) render
  // via async KO region. Wait for the Payment Method title AND at least one
  // billing form to render — otherwise readCheckoutState races the DOM.
  await page
    .waitForFunction(
      () => {
        const paymentTitle = Array.from(
          document.querySelectorAll(".checkout-payment-method .payment-group .step-title")
        ).some((el) => (el.textContent ?? "").trim().length > 0);
        const billingForms = document.querySelectorAll(".billing-address-form .step-title").length;
        return paymentTitle && billingForms > 0;
      },
      { timeout: 20_000 }
    )
    .catch(() => {});
  await page.waitForTimeout(2500);
}

// Write CheckoutState alongside pixel snapshots — same convention as swatch spec.
export async function captureCheckoutState(name: string, state: CheckoutState): Promise<void> {
  const target = process.env.VRT_TARGET ?? "current";
  if (target !== "baseline" && target !== "current") {
    throw new Error(`Invalid VRT_TARGET: "${target}"`);
  }
  const outDir = path.join(ROOT, "screenshots", target);
  await fs.mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${name}-state.json`);
  await fs.writeFile(file, JSON.stringify(state, null, 2));
  console.log(`[brand-a] state → ${target}/${name}-state.json`);
}
