/**
 * Standalone backend env validation.
 *
 * Runs the Joi schema declared in `src/config/env.schema.ts` against
 * `process.env` without booting Nest. Used by CI and by developers to confirm
 * a deploy environment is fully configured before attempting to start the app.
 *
 * Exit codes:
 *   0  validation passed
 *   1  one or more required variables are missing or invalid
 *
 * Flags:
 *   --strict   also fail when the "critical" runtime checks (matching the ones
 *              in src/main.ts) would have raised a warning (e.g. payment
 *              signing not configured).
 */

import { envSchema } from "../src/config/env.schema";

const args = process.argv.slice(2);
const strict = args.includes("--strict");

const isTTY = process.stderr.isTTY === true;
const RESET = isTTY ? "\x1b[0m" : "";
const BOLD = isTTY ? "\x1b[1m" : "";
const RED = isTTY ? "\x1b[31m" : "";
const YELLOW = isTTY ? "\x1b[33m" : "";
const GREEN = isTTY ? "\x1b[32m" : "";

const { error, value } = envSchema.validate(process.env, {
  abortEarly: false,
  allowUnknown: true,
  stripUnknown: false,
});

const errors: { name: string; message: string }[] = [];
const warnings: { name: string; message: string }[] = [];

if (error) {
  for (const detail of error.details) {
    const name = (detail.path[0] as string) ?? "<unknown>";
    errors.push({ name, message: detail.message });
  }
}

// Mirror the warn-only critical checks in src/main.ts so misconfigured deploys
// surface them before the app boots.
if (!value?.STELLAR_SECRET_KEY) {
  warnings.push({
    name: "STELLAR_SECRET_KEY",
    message:
      "Not configured — payment signing will be disabled (read-only mode).",
  });
}
if (!value?.SUPABASE_SERVICE_ROLE_KEY) {
  warnings.push({
    name: "SUPABASE_SERVICE_ROLE_KEY",
    message:
      "Not configured — admin operations that require the service role will fail.",
  });
}

function print(prefix: string, list: { name: string; message: string }[], color: string) {
  for (const issue of list) {
    console.error(
      `  ${color}${prefix}${RESET}  ${BOLD}${issue.name}${RESET}: ${issue.message}`,
    );
  }
}

if (errors.length === 0 && warnings.length === 0) {
  console.log(
    `${GREEN}[validate-env] OK${RESET} — backend env passes schema validation.`,
  );
  process.exit(0);
}

console.error("");
console.error(`${BOLD}[validate-env] backend environment validation report${RESET}`);
console.error("");

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
    `${RED}${BOLD}FAIL${RESET} — fix the above before deploying. ` +
      `Set variables in the hosting provider (prod) or local .env (dev).`,
  );
  process.exit(1);
}

console.log(`${GREEN}[validate-env] OK${RESET} (warnings only).`);
process.exit(0);
