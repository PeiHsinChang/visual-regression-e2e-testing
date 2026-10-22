import type {
  TestCategoryDefinition,
  TestFeatureDefinition,
} from "../core/testCatalog.ts";

const pdpBehaviorFeature = {
  id: "pdp-behavior",
  name: "PDP Behavior",
  description: "驗證商品詳細頁的資料、庫存與核心互動是否符合預期。",
  targetKind: "url",
  checks: [
    {
      id: "page-basics",
      name: "頁面基本資料",
      description: "驗證頁面、商品標題、SKU、價格與 gallery。",
    },
    {
      id: "preselect-default",
      name: "Preselect 預設選色",
      description:
        "URL 無 hash 時，優先使用 preselect simple，否則使用第一個顏色。",
    },
    {
      id: "inventory-consistency",
      name: "庫存資料一致性",
      description: "比對後台商品 variants 與前台呈現數量。",
    },
    {
      id: "variant-availability",
      name: "Variant 可用狀態",
      description: "驗證有貨與缺貨 variant 的顯示及選取狀態。",
    },
    {
      id: "primary-cta",
      name: "主要操作按鈕",
      description: "驗證 add to bag 與 out of stock 按鈕狀態。",
    },
    {
      id: "gallery",
      name: "商品圖片 Gallery",
      description: "驗證圖片切換與 fullscreen 互動。",
    },
    {
      id: "add-to-cart",
      name: "加入購物車",
      description: "使用第一個可售 variant 驗證加入購物車流程。",
    },
  ],
} as const satisfies TestFeatureDefinition;

export const testCategories: readonly TestCategoryDefinition[] = [
  {
    id: "product",
    name: "商品",
    description: "商品列表、詳細頁、庫存與購買入口相關測試。",
    features: [pdpBehaviorFeature],
  },
];

export function getTestCategory(categoryId: string): TestCategoryDefinition {
  const category = testCategories.find(
    (candidate) => candidate.id === categoryId
  );
  if (!category) {
    throw new Error(`Unknown test category: "${categoryId}".`);
  }
  return category;
}

export function getTestFeature(
  category: TestCategoryDefinition,
  featureId: string
): TestFeatureDefinition {
  const feature = category.features.find(
    (candidate) => candidate.id === featureId
  );
  if (!feature) {
    throw new Error(
      `Unknown test feature "${featureId}" in category "${category.id}".`
    );
  }
  return feature;
}
