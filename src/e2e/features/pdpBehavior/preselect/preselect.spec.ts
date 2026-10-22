import { expect, test } from "@playwright/test";
import {
  getBrandAdapter,
  getBrandEnvironment,
  getBrandFeatureAdapter,
} from "../../../brands/registry.ts";
import {
  validatePdpUrl,
  validateRedirectChain,
} from "../../../security/urlPolicy.ts";
import {
  capturePdpPreselectSnapshot,
  evaluatePdpPreselect,
} from "./preselect.ts";

const brand = getBrandAdapter("brand-b");
const environment = getBrandEnvironment(
  brand,
  process.env.E2E_ENVIRONMENT ?? "uk-staging"
);
const feature = getBrandFeatureAdapter(brand, "pdp-behavior");
const targetUrl = validatePdpUrl(
  process.env.E2E_TARGET_URL ??
    "https://brand-b.staging.example.com/uk/test-product-2",
  environment
).href;

test("BrandB PDP URL 無 hash 時應套用 preselect 或第一個顏色", async ({
  page,
}) => {
  const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  expect(response, "PDP 應回傳 HTTP response").not.toBeNull();
  expect(response?.status(), "PDP HTTP status 應小於 400").toBeLessThan(400);

  const redirectChain: string[] = [];
  let request = response?.request() ?? null;
  while (request) {
    redirectChain.unshift(request.url());
    request = request.redirectedFrom();
  }
  validateRedirectChain(redirectChain, environment);
  validatePdpUrl(page.url(), environment);

  const snapshot = await capturePdpPreselectSnapshot(page, feature.selectors);
  const result = evaluatePdpPreselect(snapshot, feature.rules.preselect);

  console.log(JSON.stringify(result, null, 2));
  expect(result.status, result.message).toBe("passed");
});
