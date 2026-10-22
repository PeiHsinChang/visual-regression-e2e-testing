import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { brandBAdapter } from "../brands/brand-b.ts";
import {
  PdpUrlValidationError,
  validatePdpUrl,
  validateRedirectChain,
  validateRedirectUrl,
} from "./urlPolicy.ts";

const environment = brandBAdapter.environments[0];

describe("BrandB PDP URL policy", () => {
  test("accepts and normalizes an allowed HTTPS PDP URL", () => {
    const url = validatePdpUrl(
      " https://brand-b.local.test/uk/test-product-1?preview=1#color=35 ",
      environment
    );

    assert.equal(
      url.href,
      "https://brand-b.local.test/uk/test-product-1?preview=1#color=35"
    );
  });

  test("accepts the configured BrandB UK staging origin only in staging", () => {
    const staging = brandBAdapter.environments.find(
      (candidate) => candidate.id === "uk-staging"
    );
    assert.ok(staging);
    assert.equal(
      validatePdpUrl(
        "https://brand-b.staging.example.com/uk/test-product-2",
        staging
      ).origin,
      "https://brand-b.staging.example.com"
    );
    assert.throws(
      () =>
        validatePdpUrl(
          "https://brand-b.staging.example.com/uk/test-product-2",
          environment
        ),
      PdpUrlValidationError
    );
  });

  test("rejects HTTP, unknown origins, lookalike hosts, IPs, and nonstandard ports", () => {
    const invalidUrls = [
      "http://brand-b.local.test/uk/product",
      "https://example.com/uk/product",
      "https://brand-b.local.test.example.com/uk/product",
      "https://127.0.0.1/uk/product",
      "https://brand-b.local.test:8443/uk/product",
    ];

    for (const input of invalidUrls) {
      assert.throws(() => validatePdpUrl(input, environment), PdpUrlValidationError);
    }
  });

  test("rejects credential-based host confusion and paths outside the UK store", () => {
    assert.throws(
      () => validatePdpUrl("https://brand-b.local.test@evil.example/uk/product", environment),
      (error: unknown) =>
        error instanceof PdpUrlValidationError &&
        error.code === "credentials_forbidden"
    );
    assert.throws(
      () => validatePdpUrl("https://brand-b.local.test/admin", environment),
      (error: unknown) =>
        error instanceof PdpUrlValidationError && error.code === "path_not_allowed"
    );
  });

  test("applies the same allowlist to redirects and redirect chains", () => {
    assert.equal(
      validateRedirectUrl("/uk/redirected-product", environment).pathname,
      "/uk/redirected-product"
    );
    assert.throws(
      () => validateRedirectUrl("https://evil.example/uk/product", environment),
      (error: unknown) =>
        error instanceof PdpUrlValidationError &&
        error.code === "origin_not_allowed"
    );
    assert.throws(
      () =>
        validateRedirectChain(
          [
            "/uk/first",
            "https://127.0.0.1/internal",
          ],
          environment
        ),
      PdpUrlValidationError
    );
  });

  test("rejects invalid URLs, overlong URLs, and lookalike store paths", () => {
    assert.throws(
      () => validatePdpUrl("not-a-url", environment),
      (error: unknown) =>
        error instanceof PdpUrlValidationError && error.code === "invalid_url"
    );
    assert.throws(
      () => validatePdpUrl(`https://brand-b.local.test/uk/${"x".repeat(2_048)}`, environment),
      (error: unknown) =>
        error instanceof PdpUrlValidationError && error.code === "url_too_long"
    );
    assert.throws(
      () => validatePdpUrl("https://brand-b.local.test/uk-evil/product", environment),
      (error: unknown) =>
        error instanceof PdpUrlValidationError && error.code === "path_not_allowed"
    );
  });
});
