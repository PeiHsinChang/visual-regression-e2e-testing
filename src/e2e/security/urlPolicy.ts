import type { BrandEnvironment } from "../core/brand.ts";

export type PdpUrlErrorCode =
  | "invalid_url"
  | "url_too_long"
  | "https_required"
  | "credentials_forbidden"
  | "origin_not_allowed"
  | "path_not_allowed";

export class PdpUrlValidationError extends Error {
  constructor(
    public readonly code: PdpUrlErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PdpUrlValidationError";
  }
}

export function validatePdpUrl(
  input: string,
  environment: BrandEnvironment
): URL {
  const candidate = input.trim();
  if (candidate.length > 2_048) {
    throw new PdpUrlValidationError(
      "url_too_long",
      "PDP URL must be 2048 characters or fewer."
    );
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new PdpUrlValidationError("invalid_url", "PDP URL is invalid.");
  }

  if (url.protocol !== "https:") {
    throw new PdpUrlValidationError(
      "https_required",
      "PDP URL must use HTTPS."
    );
  }

  if (url.username || url.password) {
    throw new PdpUrlValidationError(
      "credentials_forbidden",
      "PDP URL must not contain credentials."
    );
  }

  if (!environment.allowedOrigins.includes(url.origin)) {
    throw new PdpUrlValidationError(
      "origin_not_allowed",
      `PDP URL origin "${url.origin}" is not allowed.`
    );
  }

  if (
    !environment.allowedPathPrefixes.some((prefix) =>
      url.pathname.startsWith(prefix)
    )
  ) {
    throw new PdpUrlValidationError(
      "path_not_allowed",
      `PDP URL path "${url.pathname}" is not allowed.`
    );
  }

  return url;
}

export function validateRedirectUrl(
  destination: string,
  environment: BrandEnvironment,
  sourceUrl: string = environment.storefrontUrl
): URL {
  let resolved: URL;
  try {
    resolved = new URL(destination, sourceUrl);
  } catch {
    throw new PdpUrlValidationError(
      "invalid_url",
      "Redirect destination is invalid."
    );
  }
  return validatePdpUrl(resolved.href, environment);
}

export function validateRedirectChain(
  destinations: readonly string[],
  environment: BrandEnvironment
): URL[] {
  const validated: URL[] = [];
  let sourceUrl = environment.storefrontUrl;

  for (const destination of destinations) {
    const url = validateRedirectUrl(destination, environment, sourceUrl);
    validated.push(url);
    sourceUrl = url.href;
  }

  return validated;
}
