import type { Page } from "@playwright/test";
import type { PdpPreselectRule, PdpSelectors } from "../../../core/brand.ts";
import type { CheckResult } from "../../../core/types.ts";

export type ConfigurableOption = {
  id: string;
  label: string;
  products: string[];
};

export type ConfigurableAttribute = {
  id: string;
  code: string;
  position: number;
  options: ConfigurableOption[];
};

export type PdpPreselectSnapshot = {
  url: string;
  hash: string;
  configuredPreselectProductId: string | null;
  productOptions: Record<string, Record<string, string>>;
  attributes: ConfigurableAttribute[];
  simpleSkus: Record<string, string>;
  selectedValues: Record<string, string>;
  renderedSimpleProductId: string | null;
  renderedSku: string | null;
};

type PreselectExpectation = {
  source: "configured-preselect" | "first-option";
  productId: string;
  sku: string | null;
  selectedValues: Record<string, string>;
};

export async function capturePdpPreselectSnapshot(
  page: Page,
  selectors: Pick<PdpSelectors, "preselectComponent" | "renderedSku">
): Promise<PdpPreselectSnapshot> {
  await page.waitForFunction(
    (componentSelector) => {
      const element = document.querySelector(componentSelector) as
        | (Element & { _x_dataStack?: unknown[] })
        | null;
      const component = element?._x_dataStack?.[0] as
        | { selectedValues?: unknown; productIndex?: unknown }
        | undefined;
      return Boolean(component?.selectedValues && component.productIndex);
    },
    selectors.preselectComponent,
    { timeout: 10_000 }
  );

  return page.evaluate(
    ({ componentSelector, renderedSkuSelector }) => {
      type RawOption = {
        id?: unknown;
        label?: unknown;
        products?: unknown;
      };
      type RawAttribute = {
        id?: unknown;
        code?: unknown;
        position?: unknown;
        options?: unknown;
      };
      type RawComponent = {
        optionConfig?: {
          preselect?: { product_id?: unknown } | null;
          index?: Record<string, Record<string, unknown>>;
          attributes?: Record<string, RawAttribute> | RawAttribute[];
          skus?: Record<string, unknown>;
          sku?: Record<string, unknown>;
        };
        selectedValues?: Record<string, unknown> | unknown[];
        productIndex?: unknown;
      };

      const element = document.querySelector(componentSelector) as
        | (Element & { _x_dataStack?: RawComponent[] })
        | null;
      const component = element?._x_dataStack?.[0];
      if (!component?.optionConfig) {
        throw new Error("PDP preselect component state is unavailable.");
      }

      const attributesById = new Map<string, ConfigurableAttribute>();
      for (const rawAttribute of Object.values(
        component.optionConfig.attributes ?? {}
      )) {
        if (!rawAttribute || rawAttribute.id === undefined) continue;
        const id = String(rawAttribute.id);
        const options = Array.isArray(rawAttribute.options)
          ? rawAttribute.options.map((rawOption: RawOption) => ({
              id: String(rawOption.id ?? ""),
              label: String(rawOption.label ?? ""),
              products: Array.isArray(rawOption.products)
                ? rawOption.products.map(String)
                : [],
            }))
          : [];
        attributesById.set(id, {
          id,
          code: String(rawAttribute.code ?? ""),
          position: Number(rawAttribute.position ?? 0),
          options,
        });
      }

      const normalizeRecord = (
        input: Record<string, unknown> | unknown[] | undefined
      ): Record<string, string> =>
        Object.fromEntries(
          Object.entries(input ?? {})
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => [key, String(value)])
        );

      const productOptions = Object.fromEntries(
        Object.entries(component.optionConfig.index ?? {}).map(
          ([productId, options]) => [productId, normalizeRecord(options)]
        )
      );
      const preselectProductId =
        component.optionConfig.preselect?.product_id ?? null;
      const simpleSkus = normalizeRecord(
        component.optionConfig.skus ?? component.optionConfig.sku
      );

      return {
        url: window.location.href,
        hash: window.location.hash,
        configuredPreselectProductId:
          preselectProductId === null ? null : String(preselectProductId),
        productOptions,
        attributes: [...attributesById.values()].sort(
          (left, right) => left.position - right.position
        ),
        simpleSkus,
        selectedValues: normalizeRecord(component.selectedValues),
        renderedSimpleProductId:
          component.productIndex === undefined || component.productIndex === null
            ? null
            : String(component.productIndex),
        renderedSku:
          document.querySelector(renderedSkuSelector)?.textContent?.trim() ||
          null,
      } satisfies PdpPreselectSnapshot;
    },
    {
      componentSelector: selectors.preselectComponent,
      renderedSkuSelector: selectors.renderedSku,
    }
  );
}

export function evaluatePdpPreselect(
  snapshot: PdpPreselectSnapshot,
  rule: PdpPreselectRule
): CheckResult {
  if (snapshot.hash) {
    return {
      id: "preselect-default",
      name: "Preselect 預設選色",
      status: "skipped",
      message: "URL 已帶 hash，不適用無 hash 的 preselect 預設邏輯。",
      actual: { hash: snapshot.hash },
    };
  }

  const expectation = resolveExpectation(snapshot, rule);
  if ("error" in expectation) {
    return {
      id: "preselect-default",
      name: "Preselect 預設選色",
      status: "failed",
      message: expectation.error,
      actual: summarizeActual(snapshot),
    };
  }

  const selectedValuesMatch = Object.entries(
    expectation.selectedValues
  ).every(
    ([attributeId, optionId]) =>
      snapshot.selectedValues[attributeId] === optionId
  );
  const productMatches =
    snapshot.renderedSimpleProductId === expectation.productId;
  const skuMatches =
    expectation.sku === null || snapshot.renderedSku === expectation.sku;
  const passed = selectedValuesMatch && productMatches && skuMatches;

  return {
    id: "preselect-default",
    name: "Preselect 預設選色",
    status: passed ? "passed" : "failed",
    message: passed
      ? `已依 ${expectation.source} 渲染正確的 simple product。`
      : "頁面實際選項或 simple product 與預期不一致。",
    expected: expectation,
    actual: summarizeActual(snapshot),
  };
}

function resolveExpectation(
  snapshot: PdpPreselectSnapshot,
  rule: PdpPreselectRule
): PreselectExpectation | { error: string } {
  for (const source of rule.noHashPriority) {
    if (source === "configured-preselect") {
      const configuredProductId = snapshot.configuredPreselectProductId;
      if (!configuredProductId) continue;

      const configuredOptions = snapshot.productOptions[configuredProductId];
      if (!configuredOptions) {
        return {
          error: `preselect product "${configuredProductId}" 不存在於 configurable index。`,
        };
      }
      return createExpectation(
        source,
        configuredProductId,
        configuredOptions,
        snapshot.simpleSkus
      );
    }

    const primaryAttribute = snapshot.attributes.find(
      (attribute) => attribute.code === rule.attributeCode
    );
    const firstOption = primaryAttribute?.options[0];
    const firstProductId = firstOption?.products[0];
    if (!primaryAttribute || !firstOption || !firstProductId) {
      return {
        error: `找不到第一個 ${rule.attributeCode} 選項及其 simple product。`,
      };
    }

    const firstProductOptions = snapshot.productOptions[firstProductId];
    if (!firstProductOptions) {
      return {
        error: `第一個 ${rule.attributeCode} 選項對應的 simple product "${firstProductId}" 不存在。`,
      };
    }
    return createExpectation(
      source,
      firstProductId,
      firstProductOptions,
      snapshot.simpleSkus
    );
  }

  return { error: "Preselect 規則未設定任何無 hash 的選擇策略。" };
}

function createExpectation(
  source: PreselectExpectation["source"],
  productId: string,
  selectedValues: Record<string, string>,
  simpleSkus: Record<string, string>
): PreselectExpectation {
  return {
    source,
    productId,
    sku: simpleSkus[productId] ?? null,
    selectedValues,
  };
}

function summarizeActual(snapshot: PdpPreselectSnapshot): unknown {
  return {
    selectedValues: snapshot.selectedValues,
    productId: snapshot.renderedSimpleProductId,
    sku: snapshot.renderedSku,
  };
}
