import { chromium } from "@playwright/test";

const BASE = "https://brand-a.local.test";
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();

// PDP → add to cart
await page.goto(`${BASE}/uk/test-product-3`, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForSelector("#product-addtocart-button", { timeout: 20_000 });
const swatch = page.locator(".swatch-option:not(.disabled)").first();
if (await swatch.count()) { await swatch.click(); await page.waitForTimeout(500); }
await Promise.all([
  page.waitForResponse((r) => /\/checkout\/cart\/add/.test(r.url()) && r.status() < 500, { timeout: 15_000 }).catch(() => null),
  page.click("#product-addtocart-button"),
]);
await page.waitForTimeout(2000);

// Checkout
await page.goto(`${BASE}/uk/checkout/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForTimeout(8000);

// Fill address
await page.fill("#customer-email", `t${Date.now()}@x.com`);
await page.waitForTimeout(400);
await page.fill('input[name="firstname"]', "V");
await page.fill('input[name="lastname"]', "T");
await page.fill('input[name="street[0]"]', "1 Test Rd");
await page.fill('input[name="city"]', "London");
await page.fill('input[name="postcode"]', "SW1A 1AA");
await page.fill('input[name="telephone"]', "07700900000");
await page.locator('input[name="telephone"]').blur();
await page.waitForResponse((r) => /estimate-shipping-methods/.test(r.url()) && r.status() < 500, { timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(1000);

// Select shipping and advance
const firstRadio = page.locator('.table-checkout-shipping-method input[type="radio"]').first();
await firstRadio.check().catch(() => {});
await page.waitForTimeout(500);
await Promise.all([
  page.waitForResponse((r) => /\/shipping-information/.test(r.url()) && r.status() < 500, { timeout: 20_000 }).catch(() => null),
  page.click('button[data-role="opc-continue"]'),
]);
await page.waitForTimeout(3000);

// Inspect payment step DOM
const inspect = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const paymentContainer = q(".checkout-payment-method");
  return {
    paymentContainerHTML: paymentContainer?.outerHTML.slice(0, 800) ?? "no .checkout-payment-method",
    stepTitles: Array.from(document.querySelectorAll(".step-title")).map((e) => ({
      tag: e.tagName, text: e.textContent?.trim().slice(0, 60), visible: getComputedStyle(e).display !== "none",
      parent: e.parentElement?.className?.slice(0, 60),
    })),
    paymentGroupTitles: Array.from(document.querySelectorAll(".checkout-payment-method .payment-group .step-title, .checkout-payment-method .payment-group > div:first-child")).map((e) => ({
      tag: e.tagName, class: e.className.slice(0, 60), text: e.textContent?.trim().slice(0, 60),
    })),
  };
});
console.log(JSON.stringify(inspect, null, 2));

await b.close();
