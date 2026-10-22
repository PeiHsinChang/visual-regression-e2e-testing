import type { Page } from "@playwright/test";

export type StoreCase = {
  code: string;
  productPath: string;
  productId: string;
  superAttrKey: string;
  superAttrVal: string;
};

/**
 * Submit the storefront add-to-cart form for a configurable product.
 * Injects `super_attribute[key]=val` then does a real form submit (non-XHR),
 * so the guest session cookie persists the quote.
 */
export async function addToCart(page: Page, sc: StoreCase): Promise<void> {
  await page.goto(sc.productPath, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {}),
    page.evaluate(
      ([key, val]) => {
        const form = document.querySelector<HTMLFormElement>("form[action*='checkout/cart/add']");
        if (!form) throw new Error("no cart form on this page");
        const sa = document.createElement("input");
        sa.type = "hidden";
        sa.name = `super_attribute[${key}]`;
        sa.value = val;
        form.appendChild(sa);
        form.submit();
      },
      [sc.superAttrKey, sc.superAttrVal] as const,
    ),
  ]);
  await page.waitForLoadState("networkidle").catch(() => {});
}

/**
 * Login via the Hyva storefront customer login form.
 * The form uses Alpine.js `@submit.prevent` + AJAX and then a client-side
 * redirect, so we wait for the URL to change off `/customer/account/login/`.
 */
export async function loginViaStorefront(page: Page, storeCode: string): Promise<void> {
  const email = process.env.OSC_TEST_EMAIL;
  const password = process.env.OSC_TEST_PASSWORD;
  if (!email || !password) throw new Error("OSC_TEST_EMAIL / OSC_TEST_PASSWORD not set in brand-b/.env");

  await page.goto(`/${storeCode}/customer/account/login/`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  const form = page.locator("form#customer-login-form");
  await form.locator("input#email").fill(email);
  await form.locator("input#pass").fill(password);
  await form.locator("button[type='submit']").first().click();
  await page
    .waitForURL((url) => !/\/customer\/account\/login\/?$/.test(url.pathname), { timeout: 30_000 })
    .catch(() => {});
}

/**
 * Clear the logged-in customer's cart via Magento REST API.
 * Persistent carts accumulate stale items across test runs — this ensures
 * we start each checkout snapshot with exactly the items we add.
 */
export async function clearCartViaRest(page: Page, storeCode: string): Promise<void> {
  const email = process.env.OSC_TEST_EMAIL!;
  const password = process.env.OSC_TEST_PASSWORD!;
  const base = process.env.BASE_URL ?? "";

  const tokenRes = await page.request.post(`${base}/rest/${storeCode}/V1/integration/customer/token`, {
    data: { username: email, password },
    headers: { "Content-Type": "application/json" },
  });
  const token = (await tokenRes.json()) as string;

  const itemsRes = await page.request.get(`${base}/rest/${storeCode}/V1/carts/mine/items`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!itemsRes.ok()) return;
  const items = (await itemsRes.json()) as Array<{ item_id: number }>;
  for (const it of items) {
    await page.request.delete(`${base}/rest/${storeCode}/V1/carts/mine/items/${it.item_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}
