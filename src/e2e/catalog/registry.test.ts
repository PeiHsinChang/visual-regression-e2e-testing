import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { brandBAdapter } from "../brands/brand-b.ts";
import {
  getTestCategory,
  getTestFeature,
  testCategories,
} from "./registry.ts";

describe("E2E test catalog", () => {
  test("classifies PDP Behavior as a product test feature", () => {
    const category = getTestCategory("product");
    const feature = getTestFeature(category, "pdp-behavior");

    assert.equal(category.name, "商品");
    assert.equal(category.features.includes(feature), true);
    assert.equal(feature.name, "PDP Behavior");
    assert.deepEqual(
      feature.checks.map((check) => check.id),
      [
        "page-basics",
        "preselect-default",
        "inventory-consistency",
        "variant-availability",
        "primary-cta",
        "gallery",
        "add-to-cart",
      ]
    );
  });

  test("keeps BrandB selectors and rules under the PDP Behavior feature", () => {
    assert.equal(brandBAdapter.features.length, 1);
    assert.equal(brandBAdapter.features[0].featureId, "pdp-behavior");
    assert.equal(
      brandBAdapter.features[0].selectors.productForm,
      "#product_addtocart_form"
    );
  });

  test("configures BrandB UK dev and staging as separate environments", () => {
    assert.deepEqual(
      brandBAdapter.environments.map((environment) => environment.id),
      ["uk-dev", "uk-staging"]
    );
  });

  test("exposes categories for future PM/QA navigation", () => {
    assert.deepEqual(
      testCategories.map((category) => category.id),
      ["product"]
    );
  });
});
