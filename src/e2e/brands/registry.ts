import type {
  BrandAdapter,
  BrandEnvironment,
  BrandFeatureAdapter,
} from "../core/brand.ts";
import { brandBAdapter } from "./brand-b.ts";

export const brandAdapters: readonly BrandAdapter[] = [brandBAdapter];

export function getBrandAdapter(brandId: string): BrandAdapter {
  const adapter = brandAdapters.find((candidate) => candidate.id === brandId);
  if (!adapter) {
    throw new Error(`Unknown brand: "${brandId}".`);
  }
  return adapter;
}

export function getBrandEnvironment(
  adapter: BrandAdapter,
  environmentId: string
): BrandEnvironment {
  const environment = adapter.environments.find(
    (candidate) => candidate.id === environmentId
  );
  if (!environment) {
    throw new Error(
      `Unknown environment "${environmentId}" for brand "${adapter.id}".`
    );
  }
  return environment;
}

export function getBrandFeatureAdapter(
  adapter: BrandAdapter,
  featureId: string
): BrandFeatureAdapter {
  const feature = adapter.features.find(
    (candidate) => candidate.featureId === featureId
  );
  if (!feature) {
    throw new Error(
      `Brand "${adapter.id}" does not support test feature "${featureId}".`
    );
  }
  return feature;
}
