export type {
  BrandAdapter,
  BrandEnvironment,
  BrandFeatureAdapter,
  CtaExpectation,
  PdpRules,
  PdpSelectors,
  PdpBehaviorFeatureAdapter,
  PdpPreselectRule,
  StockBehaviorRule,
  VariantControlExpectation,
} from "./core/brand.ts";
export type {
  TestCategoryDefinition,
  TestCheckDefinition,
  TestFeatureDefinition,
} from "./core/testCatalog.ts";
export type {
  Artifact,
  ArtifactKind,
  CheckResult,
  CheckStatus,
  InventoryState,
  InventorySummary,
  Product,
  ProductVariant,
  RunStatus,
  StockStatus,
  TestRun,
} from "./core/types.ts";
export {
  brandAdapters,
  getBrandAdapter,
  getBrandEnvironment,
  getBrandFeatureAdapter,
} from "./brands/registry.ts";
export { brandBAdapter } from "./brands/brand-b.ts";
export {
  getTestCategory,
  getTestFeature,
  testCategories,
} from "./catalog/registry.ts";
export type {
  CreateTestRunDependencies,
  CreateTestRunInput,
} from "./jobs/createRun.ts";
export { createTestRun } from "./jobs/createRun.ts";
export type { PdpUrlErrorCode } from "./security/urlPolicy.ts";
export {
  PdpUrlValidationError,
  validatePdpUrl,
  validateRedirectChain,
  validateRedirectUrl,
} from "./security/urlPolicy.ts";
export type {
  ConfigurableAttribute,
  ConfigurableOption,
  PdpPreselectSnapshot,
} from "./features/pdpBehavior/preselect/preselect.ts";
export {
  capturePdpPreselectSnapshot,
  evaluatePdpPreselect,
} from "./features/pdpBehavior/preselect/preselect.ts";
