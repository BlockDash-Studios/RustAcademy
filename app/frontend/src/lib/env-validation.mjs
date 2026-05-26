// Pure JS validators shared by the runtime (src/lib/env.ts) and the
// build-time script (scripts/validate-env.mjs). No imports, no side effects —
// import this file from either context.

const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);
const VALID_NETWORKS = new Set(["testnet", "mainnet", "futurenet"]);
const PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function stripTrailingSlash(value) {
  return value.replace(/\/$/, "");
}

/**
 * @param {Record<string, string | undefined>} source
 */
export function validateClientEnv(source) {
  const issues = [];
  const nodeEnv = (source.NODE_ENV ?? "development").toLowerCase();
  const vercelEnv = source.NEXT_PUBLIC_VERCEL_ENV?.trim();
  const isProduction =
    nodeEnv === "production" || vercelEnv === "production";

  const apiBaseRaw = source.NEXT_PUBLIC_QUICKEX_API_URL?.trim();
  if (!apiBaseRaw) {
    issues.push({
      name: "NEXT_PUBLIC_QUICKEX_API_URL",
      message:
        "Backend API base URL is not set. Set NEXT_PUBLIC_QUICKEX_API_URL to the public backend origin (e.g. https://api.quickex.example.com).",
      severity: isProduction ? "error" : "warning",
    });
  } else if (!isHttpUrl(apiBaseRaw)) {
    issues.push({
      name: "NEXT_PUBLIC_QUICKEX_API_URL",
      message: `Value "${apiBaseRaw}" is not a valid http(s) URL.`,
      severity: "error",
    });
  }

  const siteUrlRaw = source.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrlRaw) {
    issues.push({
      name: "NEXT_PUBLIC_SITE_URL",
      message:
        "Public site URL is not set. Set NEXT_PUBLIC_SITE_URL so absolute OpenGraph URLs and metadataBase resolve correctly.",
      severity: isProduction ? "error" : "warning",
    });
  } else if (!isHttpUrl(siteUrlRaw)) {
    issues.push({
      name: "NEXT_PUBLIC_SITE_URL",
      message: `Value "${siteUrlRaw}" is not a valid http(s) URL.`,
      severity: "error",
    });
  }

  const networkRaw = source.NEXT_PUBLIC_STELLAR_NETWORK?.trim().toLowerCase();
  if (!networkRaw) {
    issues.push({
      name: "NEXT_PUBLIC_STELLAR_NETWORK",
      message:
        "Stellar network is not set. Set NEXT_PUBLIC_STELLAR_NETWORK to 'testnet' or 'mainnet'.",
      severity: isProduction ? "error" : "warning",
    });
  } else if (!VALID_NETWORKS.has(networkRaw)) {
    issues.push({
      name: "NEXT_PUBLIC_STELLAR_NETWORK",
      message: `Value "${networkRaw}" is not a recognised Stellar network. Allowed: testnet, mainnet, futurenet.`,
      severity: "error",
    });
  }

  const errorReportingEnabled = TRUE_VALUES.has(
    (source.NEXT_PUBLIC_ERROR_REPORTING_ENABLED ?? "").trim().toLowerCase(),
  );
  const errorReportingUrl =
    source.NEXT_PUBLIC_ERROR_REPORTING_URL?.trim() || undefined;
  if (errorReportingEnabled) {
    if (!errorReportingUrl) {
      issues.push({
        name: "NEXT_PUBLIC_ERROR_REPORTING_URL",
        message:
          "Error reporting is enabled but no destination URL is set. Set NEXT_PUBLIC_ERROR_REPORTING_URL or unset NEXT_PUBLIC_ERROR_REPORTING_ENABLED.",
        severity: "error",
      });
    } else if (!isHttpUrl(errorReportingUrl)) {
      issues.push({
        name: "NEXT_PUBLIC_ERROR_REPORTING_URL",
        message: `Value "${errorReportingUrl}" is not a valid http(s) URL.`,
        severity: "error",
      });
    }
  }

  const analyticsPublicKey =
    source.NEXT_PUBLIC_QUICKEX_ANALYTICS_PUBLIC_KEY?.trim();
  if (analyticsPublicKey && !PUBLIC_KEY_REGEX.test(analyticsPublicKey)) {
    issues.push({
      name: "NEXT_PUBLIC_QUICKEX_ANALYTICS_PUBLIC_KEY",
      message:
        "Value is not a valid Stellar public key (must start with G and be 56 chars).",
      severity: "error",
    });
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  if (hasErrors) {
    return { ok: false, env: null, issues };
  }

  return {
    ok: true,
    env: {
      apiBaseUrl: apiBaseRaw
        ? stripTrailingSlash(apiBaseRaw)
        : "http://localhost:4000",
      siteUrl: siteUrlRaw
        ? stripTrailingSlash(siteUrlRaw)
        : "http://localhost:3000",
      stellarNetwork: networkRaw ?? "testnet",
      errorReportingEnabled,
      errorReportingUrl,
      appVersion: source.NEXT_PUBLIC_APP_VERSION?.trim() || "unknown",
      vercelEnv,
      analyticsPublicKey,
    },
    issues,
  };
}

/**
 * @param {Record<string, string | undefined>} source
 */
export function validateServerEnv(source) {
  const issues = [];

  const internalApiUrl = source.QUICKEX_INTERNAL_API_URL?.trim();
  if (internalApiUrl && !isHttpUrl(internalApiUrl)) {
    issues.push({
      name: "QUICKEX_INTERNAL_API_URL",
      message: `Value "${internalApiUrl}" is not a valid http(s) URL.`,
      severity: "error",
    });
  }

  const rawNodeEnv = (source.NODE_ENV ?? "development").toLowerCase();
  const nodeEnv =
    rawNodeEnv === "production" || rawNodeEnv === "test"
      ? rawNodeEnv
      : "development";

  const hasErrors = issues.some((i) => i.severity === "error");
  if (hasErrors) {
    return { ok: false, env: null, issues };
  }

  return {
    ok: true,
    env: {
      internalApiUrl: internalApiUrl
        ? stripTrailingSlash(internalApiUrl)
        : undefined,
      nodeEnv,
    },
    issues,
  };
}
