import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { brandBAdapter } from "../../../brands/brand-b.ts";
import {
  evaluatePdpPreselect,
  type PdpPreselectSnapshot,
} from "./preselect.ts";

const rule = brandBAdapter.features[0].rules.preselect;

function createSnapshot(
  overrides: Partial<PdpPreselectSnapshot> = {}
): PdpPreselectSnapshot {
  return {
    url: "https://brand-b.staging.example.com/uk/test-product",
    hash: "",
    configuredPreselectProductId: null,
    productOptions: {
      "1645": { "93": "24" },
      "1646": { "93": "506" },
    },
    attributes: [
      {
        id: "93",
        code: "color",
        position: 0,
        options: [
          { id: "24", label: "eclipse", products: ["1645"] },
          { id: "506", label: "maple", products: ["1646"] },
        ],
      },
    ],
    simpleSkus: {
      "1645": "Z2BJVLRA1001UK",
      "1646": "Z2BJVLRA1002UK",
    },
    selectedValues: { "93": "24" },
    renderedSimpleProductId: "1645",
    renderedSku: "Z2BJVLRA1001UK",
    ...overrides,
  };
}

describe("PDP preselect business rule", () => {
  test("renders the configured preselect simple product when no hash exists", () => {
    const result = evaluatePdpPreselect(
      createSnapshot({
        configuredPreselectProductId: "1646",
        selectedValues: { "93": "506" },
        renderedSimpleProductId: "1646",
        renderedSku: "Z2BJVLRA1002UK",
      }),
      rule
    );

    assert.equal(result.status, "passed");
    assert.deepEqual(result.expected, {
      source: "configured-preselect",
      productId: "1646",
      sku: "Z2BJVLRA1002UK",
      selectedValues: { "93": "506" },
    });
  });

  test("uses the first color simple product when preselect is absent", () => {
    const result = evaluatePdpPreselect(createSnapshot(), rule);

    assert.equal(result.status, "passed");
    assert.deepEqual(result.expected, {
      source: "first-option",
      productId: "1645",
      sku: "Z2BJVLRA1001UK",
      selectedValues: { "93": "24" },
    });
  });

  test("fails when the rendered simple product does not match the fallback", () => {
    const result = evaluatePdpPreselect(
      createSnapshot({
        selectedValues: { "93": "506" },
        renderedSimpleProductId: "1646",
        renderedSku: "Z2BJVLRA1002UK",
      }),
      rule
    );

    assert.equal(result.status, "failed");
  });

  test("fails when a configured preselect product is missing from the index", () => {
    const result = evaluatePdpPreselect(
      createSnapshot({ configuredPreselectProductId: "9999" }),
      rule
    );

    assert.equal(result.status, "failed");
    assert.match(result.message ?? "", /不存在於 configurable index/);
  });

  test("skips the no-hash rule when the URL already has a hash", () => {
    const result = evaluatePdpPreselect(
      createSnapshot({ hash: "#color=506" }),
      rule
    );

    assert.equal(result.status, "skipped");
  });
});
