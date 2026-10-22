export type RunStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "error";

export type StockStatus = "in_stock" | "out_of_stock" | "unknown";

export type CheckStatus = "passed" | "failed" | "skipped" | "warning";

export type ArtifactKind = "screenshot" | "trace" | "log" | "json";

export type InventoryState = {
  status: StockStatus;
  salableQuantity?: number;
};

export type ProductVariant = {
  sku: string;
  label?: string;
  options: Record<string, string>;
  inventory: InventoryState;
};

export type Product = {
  sku: string;
  name: string;
  url: string;
  variants: ProductVariant[];
};

export type InventorySummary = {
  total: number;
  inStock: number;
  outOfStock: number;
  unknown: number;
};

export type CheckResult = {
  id: string;
  name: string;
  status: CheckStatus;
  expected?: unknown;
  actual?: unknown;
  message?: string;
  startedAt?: string;
  completedAt?: string;
};

export type Artifact = {
  id: string;
  kind: ArtifactKind;
  path: string;
  mimeType: string;
  createdAt: string;
};

export type TestRun = {
  id: string;
  categoryId: string;
  featureId: string;
  brandId: string;
  environmentId: string;
  market: string;
  targetUrl: string;
  requestedBy: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  product?: Product;
  inventory?: InventorySummary;
  checks: CheckResult[];
  artifacts: Artifact[];
  warnings: string[];
};
