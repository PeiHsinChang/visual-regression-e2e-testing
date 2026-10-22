import { randomUUID } from "node:crypto";
import {
  getBrandAdapter,
  getBrandEnvironment,
  getBrandFeatureAdapter,
} from "../brands/registry.ts";
import { getTestCategory, getTestFeature } from "../catalog/registry.ts";
import type { TestRun } from "../core/types.ts";
import { validatePdpUrl } from "../security/urlPolicy.ts";

export type CreateTestRunInput = {
  categoryId: string;
  featureId: string;
  brandId: string;
  environmentId: string;
  targetUrl: string;
  requestedBy: string;
};

export type CreateTestRunDependencies = {
  createId?: () => string;
  now?: () => Date;
};

export function createTestRun(
  input: CreateTestRunInput,
  dependencies: CreateTestRunDependencies = {}
): TestRun {
  const requestedBy = input.requestedBy.trim();
  if (!requestedBy) {
    throw new Error("requestedBy is required.");
  }
  if (requestedBy.length > 100) {
    throw new Error("requestedBy must be 100 characters or fewer.");
  }

  const category = getTestCategory(input.categoryId);
  const feature = getTestFeature(category, input.featureId);
  const adapter = getBrandAdapter(input.brandId);
  getBrandFeatureAdapter(adapter, feature.id);
  const environment = getBrandEnvironment(adapter, input.environmentId);
  const targetUrl = validatePdpUrl(input.targetUrl, environment);
  const now = (dependencies.now ?? (() => new Date()))().toISOString();

  return {
    id: (dependencies.createId ?? randomUUID)(),
    categoryId: category.id,
    featureId: feature.id,
    brandId: adapter.id,
    environmentId: environment.id,
    market: environment.market,
    targetUrl: targetUrl.href,
    requestedBy,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    checks: [],
    artifacts: [],
    warnings: [],
  };
}
