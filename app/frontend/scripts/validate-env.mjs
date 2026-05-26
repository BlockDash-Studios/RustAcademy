#!/usr/bin/env node
/**
 * Build-time env validation for the Next.js frontend.
 *
 * Shares its rules with the runtime (src/lib/env.ts) via
 * src/lib/env-validation.mjs. Used as the `prebuild` script and in CI so
 * missing critical env vars fail the build immediately.
 *
 * Exit codes:
 *   0  validation passed (warnings allowed)
 *   1  validation failed (one or more errors)
 *
 * Flags:
 *   --strict   treat warnings as errors
 *   --skip-on-flag <ENV_NAME>
 *              skip validation when the named env var is set to 1/true/yes.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const validationModule = resolve(
  __dirname,
  "..",
  "src",
  "lib",
  "env-validation.mjs",
);

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const skipFlagIdx = args.indexOf("--skip-on-flag");
if (skipFlagIdx !== -1) {
  const flagName = args[skipFlagIdx + 1];
  if (flagName) {
    const value = (process.env[flagName] ?? "").toLowerCase();
    if (["1", "true", "yes", "on"].includes(value)) {
      console.log(
        `[validate-env] skipping (${flagName}=${process.env[flagName]})`,
      );
      process.exit(0);
    }
  }
}

const isTTY = process.stderr.isTTY === true;
const RESET = isTTY ? "\x1b[0m" : "";
const BOLD = isTTY ? "\x1b[1m" : "";
const RED = isTTY ? "\x1b[31m" : "";
const YELLOW = isTTY ? "\x1b[33m" : "";
const GREEN = isTTY ? "\x1b[32m" : "";

let validateClientEnv, validateServerEnv;
try {
  const mod = await import(pathToFileURL(validationModule).href);
  validateClientEnv = mod.validateClientEnv;
  validateServerEnv = mod.validateServerEnv;
} catch (err) {
  console.error(
    `[validate-env] failed to load validators from ${validationModule}:`,
    err.message,
  );
  process.exit(2);
}

const source = process.env;
const clientResult = validateClientEnv(source);
const serverResult = validateServerEnv(source);

const all = [...clientResult.issues, ...serverResult.issues];
const errors = all.filter((i) => i.severity === "error");
const warnings = all.filter((i) => i.severity === "warning");

if (errors.length === 0 && warnings.length === 0) {
  console.log(
    `${GREEN}[validate-env] OK${RESET} — all required env vars present and valid.`,
  );
  process.exit(0);
}

console.error("");
console.error(`${BOLD}[validate-env] environment validation report${RESET}`);
console.error("");

function print(prefix, list, color) {
  for (const issue of list) {
    console.error(
      `  ${color}${prefix}${RESET}  ${BOLD}${issue.name}${RESET}: ${issue.message}`,
    );
  }
}

if (errors.length > 0) {
  console.error(`${BOLD}Errors (${errors.length}):${RESET}`);
  print("ERROR  ", errors, RED);
  console.error("");
}
if (warnings.length > 0) {
  console.error(`${BOLD}Warnings (${warnings.length}):${RESET}`);
  print("WARN   ", warnings, YELLOW);
  console.error("");
}

if (errors.length > 0 || (strict && warnings.length > 0)) {
  console.error(
    `${RED}${BOLD}FAIL${RESET} — fix the above before building. ` +
      `Set variables in .env.local (dev) or your hosting provider (prod).`,
  );
  process.exit(1);
}

console.log(`${GREEN}[validate-env] OK${RESET} (warnings only).`);
process.exit(0);
