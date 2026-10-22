import { test, expect } from "@playwright/test";
import { takeProjectSnapshot } from "../../src/sdk/index.ts";
import { captureSwatchState, dismissCookieBanner, readPDPState, waitForImagesLoaded, waitStable } from "./helpers.ts";

// Logico L i-Size R129 has 3 color options (Black / Iron / Midnight).
const PDP_PATH = "/uk/test-product-3";
const CART_PATH = "/uk/checkout/cart/";
const PDP_COLORS = ["Black", "Iron", "Midnight"] as const;

// Breaze Lite 2 (pushchair) — only fixture on this site where per-color chip
// render can be observed. Chips only render on PLP tiles, never on PDP.
const PLP_CHIPS_PATH = "/uk/pushchairs";
const PLP_CHIPS_PRODUCT = "Breaze Lite";

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test.describe("brand-a color swatch — PDP initial state", () => {
  test("PDP loads with all colors unselected", async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.goto(PDP_PATH, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector(".swatch-attribute .swatch-option", { timeout: 20_000 });
    await dismissCookieBanner(page);
    await page.waitForTimeout(500);

    const initial = await readPDPState(page);
    expect(initial.swatchOptionCount, "expected multi-color PDP fixture").toBeGreaterThanOrEqual(2);
    await captureSwatchState("brand-a-pdp-initial", initial);
    await waitForImagesLoaded(page);
    await takeProjectSnapshot(page, testInfo, "brand-a-pdp-initial");
  });
});

test.describe("brand-a color swatch — PDP per-color click + add to cart", () => {
  for (const label of PDP_COLORS) {
    test(`click ${label}: assert state + add to cart + cart page screenshot`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      const slug = label.replace(/\s+/g, "_").toLowerCase();

      await page.goto(PDP_PATH, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForSelector(".swatch-attribute .swatch-option", { timeout: 20_000 });
      await dismissCookieBanner(page);
      await page.waitForTimeout(500);

      const optionId = await page.evaluate(
        (l) =>
          document
            .querySelector(`.swatch-option[data-option-label="${l}"]`)
            ?.getAttribute("data-option-id") ?? null,
        label
      );
      if (!optionId) throw new Error(`swatch option with label "${label}" not found`);

      // If this color is Magento's default preselect, clicking it would toggle-off.
      // Nudge selection to another color first so our click is a real select-into-target.
      const preselected = await readPDPState(page);
      if (preselected.dataOptionSelected === optionId) {
        const other = preselected.options.find(
          (o) => o.optionId !== optionId && !o.disabled && !o.outOfStock
        );
        if (other?.optionId) {
          await page.click(`.swatch-option[data-option-id="${other.optionId}"]`);
          await waitStable(page, other.optionId);
        }
      }

      // === 1. Click + wait for renderer to converge ===
      await page.click(`.swatch-option[data-option-id="${optionId}"]`);
      await waitStable(page, optionId);
      const after = await readPDPState(page);

      // === 2. Assertions: price / gallery / color state must all be right ===
      expect(after.dataOptionSelected, `${slug}: dataOptionSelected must equal clicked optionId`)
        .toBe(optionId);
      expect(after.hiddenInputValue, `${slug}: super_attribute hidden input must equal clicked optionId`)
        .toBe(optionId);
      expect(after.selectedOptionLabel, `${slug}: selected label must be populated`).toBeTruthy();
      expect(after.price, `${slug}: price must be populated`).toBeTruthy();
      expect(after.mainImage, `${slug}: gallery main image must be populated`).toBeTruthy();
      const selectedOpt = after.options.find((o) => o.optionId === optionId);
      expect(selectedOpt?.selected, `${slug}: clicked option must have .selected class`).toBe(true);
      expect(selectedOpt?.ariaChecked, `${slug}: clicked option must have aria-checked=true`).toBe("true");

      await captureSwatchState(`brand-a-pdp-click-${slug}`, after);
      await waitForImagesLoaded(page);
      await takeProjectSnapshot(page, testInfo, `brand-a-pdp-click-${slug}`);

      // === 3. Add to Cart (skip if out of stock) ===
      if (!after.addToCartBtnVisible) {
        console.log(`  [${slug}] add-to-cart button hidden (out of stock) — skipping cart step`);
        return;
      }
      await Promise.all([
        page.waitForResponse(
          (res) => /\/(checkout\/cart\/add|customer\/section\/load)/.test(res.url()) && res.status() < 500,
          { timeout: 15_000 }
        ).catch(() => null),
        page.click("#product-addtocart-button"),
      ]);
      await page.waitForTimeout(1500);

      // === 4. Cart page screenshot ===
      await page.goto(CART_PATH, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await dismissCookieBanner(page);
      await page.waitForTimeout(800);
      await waitForImagesLoaded(page);
      await takeProjectSnapshot(page, testInfo, `brand-a-cart-after-${slug}`);
    });
  }
});

test.describe("brand-a color swatch — PDP deselect", () => {
  test("click twice on same swatch → toggle-off", async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.goto(PDP_PATH, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector(".swatch-attribute .swatch-option", { timeout: 20_000 });
    await dismissCookieBanner(page);
    await page.waitForTimeout(500);

    const optionId = await page.evaluate(() =>
      document.querySelector(".swatch-option")?.getAttribute("data-option-id")
    );
    if (!optionId) throw new Error("no swatch option found");

    await page.click(`.swatch-option[data-option-id="${optionId}"]`);
    await waitStable(page, optionId);
    await page.click(`.swatch-option[data-option-id="${optionId}"]`);
    await page
      .waitForFunction(
        () => !document.querySelector(".swatch-attribute")?.getAttribute("data-option-selected"),
        { timeout: 3000 }
      )
      .catch(() => {});
    const deselected = await readPDPState(page);
    expect(deselected.dataOptionSelected, "deselect: dataOptionSelected should be null").toBeNull();
    expect(deselected.hiddenInputValue, "deselect: hidden input should be empty").toBe("");
    await captureSwatchState("brand-a-pdp-deselect", deselected);
    await waitForImagesLoaded(page);
    await takeProjectSnapshot(page, testInfo, "brand-a-pdp-deselect");
  });
});

test.describe("brand-a color swatch — PDP keyboard", () => {
  test("Space / Enter on focused swatch", async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.goto(PDP_PATH, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector(".swatch-attribute .swatch-option", { timeout: 20_000 });
    await dismissCookieBanner(page);
    await page.waitForTimeout(500);

    await page.evaluate(() =>
      document.querySelector<HTMLElement>(".swatch-option")?.focus()
    );
    await page.keyboard.press("Space");
    await page.waitForTimeout(700);
    await captureSwatchState("brand-a-pdp-keyboard-space", await readPDPState(page));
    await waitForImagesLoaded(page);
    await takeProjectSnapshot(page, testInfo, "brand-a-pdp-keyboard-space");

    await page.evaluate(() => {
      document.querySelector(".swatch-option.selected")?.classList.remove("selected");
      document.querySelector(".swatch-attribute")?.removeAttribute("data-option-selected");
      document
        .querySelectorAll(".swatch-option")
        .forEach((o) => o.setAttribute("aria-checked", "false"));
    });
    await page.evaluate(() =>
      document.querySelector<HTMLElement>(".swatch-option")?.focus()
    );
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
    await captureSwatchState("brand-a-pdp-keyboard-enter", await readPDPState(page));
    await waitForImagesLoaded(page);
    await takeProjectSnapshot(page, testInfo, "brand-a-pdp-keyboard-enter");
  });
});

test.describe("brand-a color swatch — PLP tile chips", () => {
  test(`${PLP_CHIPS_PRODUCT} tile: chip re-renders per color`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto(PLP_CHIPS_PATH, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector(".product-item .swatch-option", { timeout: 20_000 });
    await dismissCookieBanner(page);
    await page.waitForTimeout(800);

    const initial = await page.evaluate((name) => {
      const tile = Array.from(document.querySelectorAll(".product-item")).find((t) =>
        t.querySelector(".product-item-link")?.textContent?.includes(name)
      );
      if (!tile) throw new Error(`tile "${name}" not found`);
      return {
        options: Array.from(tile.querySelectorAll(".swatch-option")).map((o) => ({
          optionId: o.getAttribute("data-option-id"),
          label: o.getAttribute("data-option-label"),
        })),
      };
    }, PLP_CHIPS_PRODUCT);
    expect(initial.options.length, "Breaze Lite 2 should expose 2+ colors").toBeGreaterThanOrEqual(2);
    await waitForImagesLoaded(page);
    await takeProjectSnapshot(page, testInfo, "brand-a-plp-chips-initial");

    for (const opt of initial.options) {
      const slug = (opt.label ?? "unknown").replace(/\s+/g, "_").toLowerCase();
      const key = `brand-a-plp-chips-click-${slug}`;
      await page.evaluate(
        ([name, oid]) => {
          const tile = Array.from(document.querySelectorAll(".product-item")).find((t) =>
            t.querySelector(".product-item-link")?.textContent?.includes(name!)
          );
          tile?.querySelector<HTMLElement>(`.swatch-option[data-option-id="${oid}"]`)?.click();
        },
        [PLP_CHIPS_PRODUCT, opt.optionId] as const
      );
      await page.waitForTimeout(700);

      const chipState = await page.evaluate(
        ([name, oid]) => {
          const tile = Array.from(document.querySelectorAll(".product-item")).find((t) =>
            t.querySelector(".product-item-link")?.textContent?.includes(name!)
          );
          return {
            clickedOptionId: oid,
            clickedLabel: tile
              ?.querySelector(`.swatch-option[data-option-id="${oid}"]`)
              ?.getAttribute("data-option-label"),
            chips: Array.from(
              tile?.querySelectorAll(".product-item__labels .product-item-label") ?? []
            ).map((c) => ({
              class: c.getAttribute("data-class"),
              value: c.getAttribute("data-value"),
            })),
            tileImage:
              tile?.querySelector<HTMLImageElement>(".product-image-photo")?.getAttribute("src") ?? null,
            dataOptionSelected: tile
              ?.querySelector(".swatch-attribute")
              ?.getAttribute("data-option-selected"),
          };
        },
        [PLP_CHIPS_PRODUCT, opt.optionId] as const
      );
      await captureSwatchState(key, chipState as any);
      await waitForImagesLoaded(page);
      await takeProjectSnapshot(page, testInfo, key);
    }
  });
});
