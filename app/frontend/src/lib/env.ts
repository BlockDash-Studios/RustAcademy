/**
 * Centralized, validated access to environment variables.
 *
 * Two scopes are exposed:
 *   - `clientEnv`: NEXT_PUBLIC_* values safe to inline into the browser bundle.
 *   - `serverEnv`: server-only values. Reading these in client code throws.
 *
 * Validation logic lives in `./env-validation.mjs` so the build-time script
 * (scripts/validate-env.mjs) can share it without a transpilation step.
 *
 * Required variables fail fast: validation returns `ok: false` and callers
 * (e.g. the root layout) render the Misconfiguration screen rather than
 * booting a half-working app.
 */

import {
  validateClientEnv as runClientValidation,
  validateServerEnv as runServerValidation,
} from "@/lib/env-validation.mjs";

export type EnvIssue = {
  name: string;
  message: string;
  severity: "error" | "warning";
};

export type ValidatedClientEnv = {
  apiBaseUrl: string;
  siteUrl: string;
  stellarNetwork: "testnet" | "mainnet" | "futurenet";
  errorReportingEnabled: boolean;
  errorReportingUrl?: string;
  appVersion: string;
  vercelEnv?: string;
  analyticsPublicKey?: string;
};

export type ValidatedServerEnv = {
  internalApiUrl?: string;
  nodeEnv: "development" | "production" | "test";
};

export type ValidationResult<T> = {
  ok: boolean;
  env: T | null;
  issues: EnvIssue[];
};

export function validateClientEnv(
  source: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): ValidationResult<ValidatedClientEnv> {
  return runClientValidation(source) as ValidationResult<ValidatedClientEnv>;
}

export function validateServerEnv(
  source: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): ValidationResult<ValidatedServerEnv> {
  return runServerValidation(source) as ValidationResult<ValidatedServerEnv>;
}

function formatIssues(issues: EnvIssue[]): string {
  return issues
    .map((i) => `  [${i.severity.toUpperCase()}] ${i.name}: ${i.message}`)
    .join("\n");
}

/**
 * Resolve the validated client env once, memoised per process/runtime.
 * Returns `null` when validation fails — callers (e.g. the root layout)
 * should render the Misconfiguration screen instead of booting.
 */
let cachedClientEnv: ValidatedClientEnv | null | undefined;
let cachedClientIssues: EnvIssue[] = [];

export function getClientEnv(): ValidatedClientEnv | null {
  if (cachedClientEnv !== undefined) return cachedClientEnv;
  const result = validateClientEnv();
  cachedClientIssues = result.issues;
  cachedClientEnv = result.env;
  if (!result.ok && typeof window === "undefined") {
    // eslint-disable-next-line no-console
    console.error(
      `[env] Client env validation failed:\n${formatIssues(result.issues)}`,
    );
  } else if (result.issues.length > 0 && typeof window === "undefined") {
    // eslint-disable-next-line no-console
    console.warn(
      `[env] Client env validation warnings:\n${formatIssues(result.issues)}`,
    );
  }
  return cachedClientEnv;
}

export function getClientEnvIssues(): EnvIssue[] {
  if (cachedClientEnv === undefined) getClientEnv();
  return cachedClientIssues;
}

/**
 * Resolve the validated server env. Throws if called from the browser.
 */
let cachedServerEnv: ValidatedServerEnv | null | undefined;

export function getServerEnv(): ValidatedServerEnv {
  if (typeof window !== "undefined") {
    throw new Error(
      "getServerEnv() called from the browser. Server-only secrets must not be referenced in client code.",
    );
  }
  if (cachedServerEnv) return cachedServerEnv;
  const result = validateServerEnv();
  if (!result.ok || !result.env) {
    const message = `[env] Server env validation failed:\n${formatIssues(result.issues)}`;
    // eslint-disable-next-line no-console
    console.error(message);
    throw new Error(message);
  }
  cachedServerEnv = result.env;
  return cachedServerEnv;
}
