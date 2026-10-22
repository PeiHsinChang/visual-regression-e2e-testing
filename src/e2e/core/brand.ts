export type VariantControlExpectation =
  | "visible-selectable"
  | "visible-disabled"
  | "hidden";

export type CtaExpectation =
  | "visible-enabled"
  | "visible-disabled"
  | "hidden-or-disabled"
  | "not-primary";

export type StockBehaviorRule = {
  variantControl: VariantControlExpectation;
  addToBag: CtaExpectation;
  outOfStock: CtaExpectation;
};

export type PdpPreselectRule = {
  attributeCode: string;
  noHashPriority: readonly ["configured-preselect", "first-option"];
};

export type PdpRules = {
  preselect: PdpPreselectRule;
  inStock: StockBehaviorRule;
  outOfStock: StockBehaviorRule;
  verifyGallery: boolean;
  addFirstSalableVariantToCart: boolean;
};

export type PdpSelectors = {
  productForm: string;
  productSkuAttribute: string;
  title: string;
  price: string;
  gallery: string;
  variantOptions: string;
  addToBag: string;
  outOfStock: string;
  galleryNext: string;
  galleryFullscreen: string;
  preselectComponent: string;
  renderedSku: string;
};

export type BrandEnvironment = {
  id: string;
  label: string;
  market: string;
  storefrontUrl: string;
  allowedOrigins: readonly string[];
  allowedPathPrefixes: readonly string[];
};

export type PdpBehaviorFeatureAdapter = {
  featureId: "pdp-behavior";
  selectors: PdpSelectors;
  rules: PdpRules;
};

export type BrandFeatureAdapter = PdpBehaviorFeatureAdapter;

export type BrandAdapter = {
  id: string;
  name: string;
  environments: readonly BrandEnvironment[];
  features: readonly BrandFeatureAdapter[];
};
