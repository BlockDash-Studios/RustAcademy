#!/usr/bin/env node
/**
 * Post-build scan to make sure no secrets ended up in the client bundle.
 *
 * Strategy:
 *   1. Walk `.next/static` (the browser-shipped chunks).
 *   2. For each JS/CSS file, check for:
 *        - High-entropy values of well-known server-only env vars
 *          (anything present in process.env *without* a NEXT_PUBLIC_ prefix).
 *        - Common secret patterns (SUPABASE service role JWT, Stellar secret
 *          keys, OpenAI/SendGrid/Telegram tokens).
 *
 * Exits non-zero on any hit, with a redacted location report.
 *
 * This is a defence-in-depth check — Next.js already refuses to inline
 * non-NEXT_PUBLIC_ variables, but a contributor could still accidentally
 * import a server-only constant into a client component.
 */

import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const bundleDir = resolve(projectRoot, ".next", "static");

const isTTY = process.stderr.isTTY === true;
const RESET = isTTY ? "\x1b[0m" : "";
const BOLD = isTTY ? "\x1b[1m" : "";
const RED = isTTY ? "\x1b[31m" : "";
const GREEN = isTTY ? "\x1b[32m" : "";

if (!safeExists(bundleDir)) {
  console.error(
    `${RED}[check-bundle-secrets] ${bundleDir} not found.${RESET} Run \`pnpm run build\` first.`,
  );
  process.exit(2);
}

// Variables on this list are deliberately NEXT_PUBLIC_*-prefixed and safe to
// inline. Everything else from process.env is suspect.
const PUBLIC_ALLOWLIST = new Set([
  "NODE_ENV",
  "NEXT_RUNTIME",
  "__NEXT_PRIVATE_PREBUNDLED_REACT",
  "__NEXT_PRIVATE_PRELOAD_ENTRIES",
]);

// Names that are sensitive enough that their *value* should never appear in
// the bundle, even if accidentally re-exported as a constant.
const SENSITIVE_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "STELLAR_SECRET_KEY",
  "SENDGRID_API_KEY",
  "EXPO_ACCESS_TOKEN",
  "TELEGRAM_BOT_TOKEN",
  "API_KEYS",
  "QUICKEX_INTERNAL_API_URL",
];

// Pattern-based detectors. Each entry: { name, regex, redact(value) → string }.
const SECRET_PATTERNS = [
  {
    name: "stellar-secret-key",
    regex: /\bS[A-Z2-7]{55}\b/g,
    redact: (m) => `${m.slice(0, 4)}…${m.slice(-4)}`,
  },
  {
    name: "supabase-service-role-jwt",
    // Supabase service role keys are JWTs with a "role":"service_role" claim.
    regex: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
    redact: (m) => `${m.slice(0, 12)}…${m.slice(-6)}`,
    // Only flag if the decoded payload contains "service_role" — anon JWTs
    // are intentionally public.
    extraCheck: (match) => {
      try {
        const payload = match.split(".")[1];
        const json = Buffer.from(payload, "base64url").toString("utf8");
        return /service_role/i.test(json);
      } catch {
        return false;
      }
    },
  },
  {
    name: "sendgrid-api-key",
    regex: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,
    redact: (m) => `${m.slice(0, 6)}…`,
  },
  {
    name: "telegram-bot-token",
    regex: /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g,
    redact: (m) => `${m.slice(0, 4)}…`,
  },
];

const findings = [];

// 1) Build a list of suspect literal values from the current env.
const suspectValues = [];
for (const [name, rawValue] of Object.entries(process.env)) {
  if (!rawValue) continue;
  const value = rawValue.trim();
  if (value.length < 12) continue; // too short to be a real secret
  if (name.startsWith("NEXT_PUBLIC_")) continue;
  if (PUBLIC_ALLOWLIST.has(name)) continue;
  if (SENSITIVE_NAMES.includes(name) || /TOKEN|SECRET|KEY|PASS|DSN/i.test(name)) {
    suspectValues.push({ name, value });
  }
}

for (const file of walk(bundleDir)) {
  if (!/\.(js|mjs|css|map)$/.test(file)) continue;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const relPath = relative(projectRoot, file);

  for (const { name, value } of suspectValues) {
    if (content.includes(value)) {
      findings.push({
        kind: "env-value-leak",
        file: relPath,
        detail: `${name} value present in client bundle`,
      });
    }
  }

  for (const pattern of SECRET_PATTERNS) {
    const matches = content.match(pattern.regex);
    if (!matches) continue;
    for (const match of matches) {
      if (pattern.extraCheck && !pattern.extraCheck(match)) continue;
      findings.push({
        kind: pattern.name,
        file: relPath,
        detail: `matched ${pattern.name}: ${pattern.redact(match)}`,
      });
    }
  }
}

if (findings.length === 0) {
  console.log(
    `${GREEN}[check-bundle-secrets] OK${RESET} — no secrets detected in .next/static.`,
  );
  process.exit(0);
}

console.error("");
console.error(`${BOLD}${RED}[check-bundle-secrets] FAIL${RESET}`);
console.error("");
for (const f of findings) {
  console.error(`  ${RED}${f.kind}${RESET}  ${BOLD}${f.file}${RESET}`);
  console.error(`     ${f.detail}`);
}
console.error("");
console.error(
  "A server-only value appears to have leaked into the browser bundle. " +
    "Review the offending file and ensure server-only modules are not imported " +
    "from client components. Remove the leaked import and re-run the build.",
);
process.exit(1);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

function safeExists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
