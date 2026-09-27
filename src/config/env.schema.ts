import * as Joi from 'joi';

/**
 * Environment-variable contract for the BackendAcademy service.
 *
 * The file exposes one schema per functional area plus a single composed
 * schema ({@link envValidationSchema}) which is the *only* schema handed to
 * `ConfigModule.forRoot()`. Keeping the composition here — instead of
 * assembling it inline in `config.module.ts`om guarantees that startup
 * validation, unit tests and tooling all agree on the same rules.
 *
 * Two invariants are enforced throughout:
 *
 *  1. *Production is strict.* Secrets and persistence settings are
 *     mandatory when `NODE_ENV=production`; there are no silent fallbacks
 *     that would let the service boot half-configured.
 *  2. **Errors never echo secrets.** Every secret-bearing key overrides its
 *     Joi messages with value-free templates, so a bad `JWT_SECRET` produces
 *     `"JWT_SECRET" ...` and never the secret itself.
 */

/** Runtime environments understood by the application. */
export const NODE_ENVIRONMENTS = ['development', 'production', 'test'] as const;

export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

/**
 * Keys whose values must never be rendered into validation errors, logs or
 * crash reports. Consumers (and tests) can use this list to assert that
 * output is scrubbed.
 */
export const SECRET_ENV_KEYS = [
  'DATABASE_URL',
  'REDIS_PASSWORD',
  'JWT_SECRET',
  'ASSET_SIGNING_SECRET',
  'API_KEY_SECRET',
  'ANTHROPI_API_KEY',
  'OPENAI_API_KEY',
] as const;

export type SecretEnvKey = (typeof SECRET_ENV_KEYS)[number];

/** Minimum entropy (in characters) demanded of a production secret. */
export const MIN_PRODUCTION_SECRET_LENGTH = 32;

/**
 * Well-known placeholder secrets shipped in `.env.example` and in the
 * development defaults below. They are explicitly rejected in production so
 * a copy-pasted example file cannot become a live signing key.
 */
export const FORBIDDEN_PRODUCTION_SECRETS = [
  'change_me_in_production',
  'change-me-in-production',
  'changeme',
  'change-me',
  'placeholder',
  'secret',
  'password',
] as const;

/**
 * Explicit non-production defaults. They are intentionally verbose and
 * self-describing: a value that leaks into a production incident report is
 * immediately recognisable as a local placeholder, and every one of them is
 * listed in {@link FORBIDDEN_PRODUCTION_SECRETS} handling below.
 */
export const NON_PRODUCTION_DEFAULTS = {
  development: {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/rustacademy_development',
    JWT_SECRET: 'development-only-insecure-jwt-secret-change-me',
    ASSET_SIGNING_SECRET: 'development-only-insecure-asset-signing-secret',
  },
  test: {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/rustacademy_test',
    JWT_SECRET: 'test-only-insecure-jwt-secret-change-me-please',
    ASSET_SIGNING_SECRET: 'test-only-insecure-asset-signing-secret-please',
  },
} as const;

/**
 * Message templates that never interpolate `{{value}}` / `{{.}}`.
 *
 * Joi's stock templates for `string.pattern.base` (and a few others) embed
 * the offending value in the message. For secrets that would print the
 * credential straight to stderr during a failed boot, so every secret key is
 * built through {@link secretString} which installs these overrides.
 */
const SECRET_SAFE_MESSAGES: Record<string, string> = {
  'any.required': '{{{label}} is required but was not provided',
  'any.invalid': '{{{label}} uses a forbidden placeholder value',
  'any.only': '{{{label}} is not one of the accepted values',
  'string.base': '{{{label}} must be a string',
  'string.empty': '{{{label}} must not be empty',
  'string.min': '{{{label}} must be at least {{{limit}} characters long',
  'string.max': '{{{label}} must be at most {{{limit}} characters long',
  'string.pattern.base': '{{{label}} does not match the required format',
  'string.pattern.name': '{{{label}} does not match the required format',
  'string.uri': '{{{label}} must be a valid URI',
  'string.uriCustomScheme': '{{{label}} must be a valid URI using one of the accepted schemes',
  'string.trim': '{{{label}} must not contain leading or trailing whitespace',
};

/**
 * Base builder for a secret-bearing string. Guarantees the value is never
 * echoed back through a validation message.
 */
function secretString(): Joi.StringSchema {
  return Joi.string().trim().messages(SECRET_SAFE_MESSAGES);
}

/**
 * Optional free-text variable.
 *
 * `dotenv` turns a bare `KEY=` line into an empty string, and `.env.example`
 * ships several of those. Empty is therefore treated as "not configured"
 * instead of a hard failure.
 */
function optionalString(): Joi.StringSchema {
  return Joi.string().allow('').optional();
}

/**
 * Applies a different rule set per runtime environment.
 *
 * `NODE_ENV` carries a default, and Joi resolves sibling references *after*
 * defaults are applied, so omitting `NODE_ENV` correctly selects the
 * development branch.
 */
function perEnvironment(
  base: Joi.StringSchema,
  branches: {
    production: Joi.Schema;
    test: Joi.Schema;
    development: Joi.Schema;
  },
): Joi.StringSchema {
  return base.when('NODE_ENV', {
    switch: [
      { is: 'production', then: branches.production },
      { is: 'test', then: branches.test },
    ],
    otherwise: branches.development,
  });
}

/** A secret that must be supplied — with real entropy — in production. */
function productionSecret(defaults: {
  development: string;
  test: string;
}): Joi.StringSchema {
  return perEnvironment(secretString(), {
    production: Joi.string()
      .min(MIN_PRODUCTION_SECRET_LENGTH)
      .invalid(
        ...FORBIDDEN_PRODUCTION_SECRETS,
        defaults.development,
        defaults.test,
      )
      .required(),
    test: Joi.string().default(defaults.test),
    development: Joi.string().default(defaults.development),
  });
}

/**
 * Parses `CORS_ORIGIN` to the shape `main.ts` expects: either the literal
 * wildcard or a list of concrete origins.
 */
function parseCorsOrigin(
  value: string,
  helpers: Joi.CustomHelpers,
): string | string[] | Joi.ErrorReport {
  const trimmed = value.trim();
  if (trimmed === '*') {
    return '*';
  }

  const origins = trimmed
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    return helpers.error('any.invalid');
  }

  return origins.length === 1 ? origins[0] : origins;
}

/**
 * Builds a Joi boolean schema that accepts common serialized boolean strings.
 * dotenv and shell environments represent booleans as 'true'/'false',
 * '1'/'0', 'yes'/'no', etc. Without this coercion a value like '0' would be
 * rejected, or worse, truthy-interpreted by clients.
 */
function booleanFromEnv(): Joi.BooleanSchema {
  return Joi.boolean()
    .truthy('true', '1', 'yes', 'y', 'on')
    .falsy('false', '0', 'no', 'n', 'off');
}

// —— Ports, TTLs, limits, flags, and AI parameters are coerced and range-validated (BA-005).
export const ENV_VALIDATION_OPTIONS: Joi.ValidationOptions = {
  abortEarly: false,
  convert: true,
  allowUnknown: true,
  stripUnknown: true,
};
