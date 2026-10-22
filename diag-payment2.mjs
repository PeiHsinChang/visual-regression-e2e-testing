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
await page.waitForTimeout(1500);

const firstRadio = page.locator('.table-checkout-shipping-method input[type="radio"]').first();
await firstRadio.check().catch(() => {});
await page.waitForTimeout(500);
await Promise.all([
  page.waitForResponse((r) => /\/shipping-information/.test(r.url()) && r.status() < 500, { timeout: 20_000 }).catch(() => null),
  page.click('button[data-role="opc-continue"]'),
]);

// Now wait 10s to fully hydrate payment step
await page.waitForTimeout(10_000);

const dump = await page.evaluate(() => {
  const opcWrapper = document.querySelector('.opc-wrapper');
  const paymentContainer = document.querySelector('.checkout-payment-method');
  const paymentGroups = document.querySelectorAll('.checkout-payment-method .payment-group');
  return {
    opcWrapperFound: !!opcWrapper,
    paymentContainerFound: !!paymentContainer,
    paymentContainerVisible: paymentContainer ? getComputedStyle(paymentContainer).display !== 'none' : false,
    paymentGroupsCount: paymentGroups.length,
    paymentGroupsInnerHTML: Array.from(paymentGroups).slice(0, 2).map(g => g.innerHTML.slice(0, 300)),
    stepTitlesInOpc: Array.from(document.querySelectorAll('.opc-wrapper .step-title')).map(e => ({
      tag: e.tagName, text: e.textContent?.trim().slice(0, 40), visible: getComputedStyle(e).display !== 'none',
      hasClientRects: e.getClientRects().length > 0,
    })),
    allStepTitles: Array.from(document.querySelectorAll('.step-title')).map(e => ({
      tag: e.tagName, text: e.textContent?.trim().slice(0, 40),
      parent: e.parentElement?.className?.slice(0, 40),
      inOpcWrapper: !!e.closest('.opc-wrapper'),
    })),
  };
});
console.log(JSON.stringify(dump, null, 2));

await b.close();
