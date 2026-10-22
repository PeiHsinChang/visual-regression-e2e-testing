import { promises as fs } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

const ROOT = process.cwd();

/**
 * Business state read-back for the Magento configurable-product PDP swatch group.
 * These are the fields the swatch renderer's `_OnClick` + `_onColorChange` cascade
 * are supposed to update — the golden baseline for a11y refactor safety.
 */
export type PDPSwatchState = {
  price: string | null;
  mainImage: string | null;
  selectedOptionLabel: string;
  dataOptionSelected: string | null;
  ariaActivedescendant: string | null;
  hiddenInputValue: string;
  hiddenInputDataAttrName: string | null;
  addToCartBtnVisible: boolean;
  outOfStockBtnVisible: boolean;
  inStockLabelVisible: boolean;
  outOfStockLabelVisible: boolean;
  swatchHint: string | null;
  eanValue: string | null;
  // _onColorChange cascade side effects (visible but cheap to assert)
  productTags: string[]; // visible tag classes on .product-tags__item
  qtyValue: string | null;
  qtyMinusDisabled: boolean;
  qtyPlusDisabled: boolean;
  buyNowButton: { href: string | null; text: string; visible: boolean } | null;
  buyNowText: string | null;
  productInfoPriceHidden: boolean; // has .product-info-price--hide class
  priceHasSpecialClass: boolean; // .product-info-price .normal-price has .special-price
  oldPriceVisible: boolean; // .product-info-price .old-price visible
  swatchOptionCount: number;
  options: Array<{
    optionId: string | null;
    label: string | null;
    selected: boolean;
    disabled: boolean;
    outOfStock: boolean;
    ariaChecked: string | null;
  }>;
};

export async function readPDPState(page: Page): Promise<PDPSwatchState> {
  return page.evaluate(() => {
    const attr = document.querySelector(".swatch-attribute");
    const options = attr
      ? Array.from(attr.querySelectorAll(".swatch-option")).map((o) => ({
          optionId: o.getAttribute("data-option-id"),
          label: o.getAttribute("data-option-label"),
          selected: o.classList.contains("selected"),
          disabled: o.classList.contains("disabled"),
          outOfStock: o.classList.contains("out-of-stock"),
          ariaChecked: o.getAttribute("aria-checked"),
        }))
      : [];
    const hiddenInput = document.querySelector<HTMLInputElement>(".swatch-input");
    const wrapper = document.querySelector(".swatch-attribute-options");
    const isVisible = (id: string) => {
      const el = document.getElementById(id);
      return !!el && getComputedStyle(el).display !== "none";
    };
    return {
      price:
        document.querySelector("[data-price-type=finalPrice] .price")?.textContent?.trim() || null,
      mainImage:
        (document.querySelector<HTMLImageElement>(".fotorama__img.fotorama__img--full") ||
          document.querySelector<HTMLImageElement>(".fotorama__img"))?.src || null,
      selectedOptionLabel:
        document.querySelector(".swatch-attribute-selected-option")?.textContent?.trim() || "",
      dataOptionSelected: attr?.getAttribute("data-option-selected") || null,
      ariaActivedescendant: wrapper?.getAttribute("aria-activedescendant") || null,
      hiddenInputValue: hiddenInput?.value || "",
      hiddenInputDataAttrName: hiddenInput?.getAttribute("data-attr-name") || null,
      addToCartBtnVisible: isVisible("product-addtocart-button"),
      outOfStockBtnVisible: isVisible("out-of-stock-button"),
      inStockLabelVisible: isVisible("in-stock"),
      outOfStockLabelVisible: isVisible("out-of-stock"),
      swatchHint: document.getElementById("swatch-hint")?.textContent?.trim() || null,
      eanValue: document.getElementById("ean_value")?.textContent?.trim() || null,
      productTags: Array.from(document.querySelectorAll(".product-tags__item"))
        .filter((t) => getComputedStyle(t as HTMLElement).display !== "none")
        .map((t) => (t.className || "").trim()),
      qtyValue: (document.getElementById("qty") as HTMLInputElement | null)?.value ?? null,
      qtyMinusDisabled:
        !!document.getElementById("btn-minus")?.classList.contains("control--disabled"),
      qtyPlusDisabled:
        !!document.getElementById("btn-plus")?.classList.contains("control--disabled"),
      buyNowButton: (() => {
        const el = document.getElementById("buy-now-button");
        if (!el) return null;
        return {
          href: (el as HTMLAnchorElement).getAttribute("href"),
          text: el.textContent?.trim() ?? "",
          visible: getComputedStyle(el).display !== "none",
        };
      })(),
      buyNowText: document.getElementById("buy-now-text")?.textContent?.trim() || null,
      productInfoPriceHidden: !!document
        .querySelector(".product-info-price")
        ?.classList.contains("product-info-price--hide"),
      priceHasSpecialClass: !!document
        .querySelector(".product-info-price .normal-price")
        ?.classList.contains("special-price"),
      oldPriceVisible: (() => {
        const el = document.querySelector<HTMLElement>(".product-info-price .old-price");
        return !!el && getComputedStyle(el).display !== "none";
      })(),
      swatchOptionCount: options.length,
      options,
    };
  });
}

/**
 * Wait until a swatch click's side effects have propagated. Two phases:
 *   1. Wait for hiddenInputValue or dataOptionSelected to move from `before`.
 *      (Fires within one animation frame after `_OnClick`.)
 *   2. Wait for `.fotorama__img` to have a non-empty src. Fotorama detaches
 *      the img during color swap, so mainImage is briefly null even after the
 *      other state has updated.
 */
/**
 * Dismiss cookie / consent banners so screenshots aren't polluted by overlays.
 * brand-a-eu uses Amasty GDPR Cookie (`.amgdprcookie-*`); click the accept
 * button when present, then CSS-hide any remainder (and a few common modules
 * seen on other sites, in case this helper travels).
 */
export async function dismissCookieBanner(page: Page): Promise<void> {
  const acceptSelectors = [
    "button.amgdprcookie-button.-allow",
    "button.amgdprcookie-button.-save",
    ".amgdprcookie-button.-allow",
    "button.osano-cm-accept-all",
    ".osano-cm-accept-all",
    "#btn-cookie-allow",
    "button#cookie-accept",
    "button[data-action='accept-cookies']",
  ];
  for (const sel of acceptSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.count().catch(() => 0)) {
      await btn.click({ timeout: 1500 }).catch(() => {});
      break;
    }
  }
  await page.addStyleTag({
    content: `
      .amgdprcookie-bar-container,
      .amgdprjs-bar-template,
      #amgdpr-privacy-popup,
      .amgdprcookie-modal-container,
      .modals-overlay,
      .osano-cm-window,
      .osano-cm-dialog,
      #cookie-status-message,
      .message.global.cookie,
      [class*="cookie-banner"],
      [class*="cookie-notice"],
      [id*="cookie-banner"],
      [id*="cookie-notice"],
      [class^="optimonk"],
      [id^="om-"],
      #onetrust-banner-sdk,
      #onetrust-consent-sdk {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }
    `,
  }).catch(() => {});
  // Give hide styles + any accept animation a beat to settle before capture
  await page.waitForTimeout(200);
}

/**
 * Full-page screenshots on this site catch a Fotorama gallery + lazy-loaded
 * product tile images. Scroll to bottom to trigger lazy load, wait for all
 * <img> to finish (or short-timeout each), then scroll back to top.
 */
export async function waitForImagesLoaded(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // Trigger lazy loaders that only fire on scroll
    const original = window.scrollY;
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 700));

    // Wait for every img.complete (per-image 3s cap so a broken CDN link
    // doesn't block the whole capture)
    const imgs = Array.from(document.querySelectorAll("img")) as HTMLImageElement[];
    await Promise.all(
      imgs.map((img) => {
        if (img.complete && img.naturalWidth > 0) return null;
        return new Promise<void>((resolve) => {
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
          setTimeout(done, 3000);
        });
      })
    );

    window.scrollTo(0, original);
    await new Promise((r) => setTimeout(r, 300));
  });
}

export async function waitStable(
  page: Page,
  expectedOptionId: string,
  maxMs = 8000
): Promise<void> {
  // Phase 1: wait for _OnClick to sync dataOptionSelected to the clicked option.
  // Necessary after cross-iteration navigations where PDP is mid-hydration.
  await page
    .waitForFunction(
      (want) =>
        document.querySelector(".swatch-attribute")?.getAttribute("data-option-selected") === want,
      expectedOptionId,
      { timeout: maxMs }
    )
    .catch(() => {});
  // Phase 2: wait for Fotorama to reattach the img (src briefly null during swap).
  await page
    .waitForFunction(
      () => {
        const img =
          document.querySelector<HTMLImageElement>(".fotorama__img.fotorama__img--full") ||
          document.querySelector<HTMLImageElement>(".fotorama__img");
        return !!img?.src;
      },
      { timeout: 3000 }
    )
    .catch(() => {});
}

/**
 * Write a business-state JSON to `screenshots/{VRT_TARGET}/{name}-state.json`
 * so `pnpm vrt compare` picks it up alongside the pixel/DOM snapshots.
 * (Named `-state.json` to avoid collision with SDK's `{key}.json` DOM dumps.)
 */
export async function captureSwatchState(
  name: string,
  state: PDPSwatchState | Record<string, unknown>
): Promise<void> {
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
