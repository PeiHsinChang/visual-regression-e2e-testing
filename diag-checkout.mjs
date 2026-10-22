import { chromium } from "@playwright/test";

const BASE = "https://brand-a.local.test";
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();

const logs = [];
page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text().slice(0, 200)}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message.slice(0, 200)}`));

// PDP → add to cart
await page.goto(`${BASE}/uk/test-product-3`, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.waitForSelector("#product-addtocart-button", { timeout: 20_000 });
const swatch = page.locator(".swatch-option:not(.disabled):not(.out-of-stock)").first();
if (await swatch.count()) { await swatch.click(); await page.waitForTimeout(500); }
await Promise.all([
  page.waitForResponse((r) => /\/checkout\/cart\/add/.test(r.url()) && r.status() < 500, { timeout: 15_000 }).catch(() => null),
  page.click("#product-addtocart-button"),
]);
await page.waitForTimeout(2000);
console.log("added to cart, cart cookies:", (await ctx.cookies()).filter((c) => /cart|form_key/i.test(c.name)).map((c) => c.name));

// Checkout
await page.goto(`${BASE}/uk/checkout/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
console.log("checkout url:", page.url());
await page.waitForTimeout(5000);

const s1 = await page.evaluate(() => ({
  url: location.href,
  loader: (() => {
    const l = document.getElementById("checkout-loader");
    return l ? getComputedStyle(l).display : "no loader";
  })(),
  checkoutChildren: Array.from(document.getElementById("checkout")?.children ?? []).map((c) => ({tag: c.tagName, class: (c.className || "").slice(0, 60), id: c.id})),
  hasShippingAddress: !!document.querySelector(".checkout-shipping-address"),
  hasCustomerEmail: !!document.querySelector("#customer-email"),
  hasOpcSidebar: !!document.querySelector("#opc-sidebar"),
  bodyClasses: document.body.className,
}));
console.log("STATE @ 5s:", JSON.stringify(s1, null, 2));

await page.waitForTimeout(10000);
const s2 = await page.evaluate(() => ({
  loader: (() => {
    const l = document.getElementById("checkout-loader");
    return l ? getComputedStyle(l).display : "no loader";
  })(),
  hasShippingAddress: !!document.querySelector(".checkout-shipping-address"),
  hasCustomerEmail: !!document.querySelector("#customer-email"),
  hasOpcSidebar: !!document.querySelector("#opc-sidebar"),
  emailVisible: (() => {
    const e = document.querySelector("#customer-email");
    return e ? { display: getComputedStyle(e).display, visibility: getComputedStyle(e).visibility, offsetParent: !!e.offsetParent } : "no email";
  })(),
  opcBlockSummaryCount: document.querySelectorAll(".opc-block-summary").length,
  stepTitles: Array.from(document.querySelectorAll(".step-title")).map((e) => ({tag: e.tagName, text: e.textContent?.trim().slice(0, 50), visible: getComputedStyle(e).display !== "none"})),
}));
console.log("STATE @ 15s:", JSON.stringify(s2, null, 2));

console.log("\n===LOGS===");
logs.slice(0, 60).forEach((l) => console.log(l));

await b.close();
