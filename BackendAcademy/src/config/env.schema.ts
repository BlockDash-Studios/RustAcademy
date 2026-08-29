import * as Joi from 'joi';

/**
 * Environment-variable contract for the BackendAcademy service.
 *
 * The file exposes one schema per functional area plus a single composed
 * schema ({@link envValidationSchema}) which is the *only* schema handed to
 * `ConfigModule.forRoot()`. Keeping the composition here — instead of
 * assembling it inline in `config.module.ts` — guarantees that startup
 * validation, unit tests and tooling all agree on the same rules.
 *
 * Two invariants are enforced throughout:
 *
 *  1. **Production is strict.** Secrets and persistence settings are
 *     mandatory when `NODE_ENV=production`; there are no silent fallbacks
 *     that would let the service boot half-configured.
 *  2. **Errors never echo secrets.** Every secret-bearing key overrides its
 *     Joi messages with value-free templates, so a bad `JWT_SECRET` produces
 *     `"JWT_SECRET" ...` and never the secret itself.
 */

/** Runtime environments understood by the application. */
export const NODE_ENVIRONMENTS = ['development', 'production', 'staging', 'test'] as const;

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
  'ANTHROPIC_API_KEY',
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
 * Message templates that never interpolate `{{#value}}` / `{[.]}`.
 *
 * Joi's stock templates for `string.pattern.base` (and a few others) embed
 * the offending value in the message. For secrets that would print the
 * credential straight to stderr during a failed boot, so every secret key is
 * built through {@link secretString} which installs these overrides.
 */
const SECRET_SAFE_MESSAGES: Record<string, string> = {
  'any.required': '{{#label}} is required but was not provided',
  'any.invalid': '{{#label}} uses a forbidden placeholder value',
  'any.only': '{{#label}} is not one of the accepted values',
  'string.base': '{{#label}} must be a string',
  'string.empty': '{{#label}} must not be empty',
  'string.min': '{{#label}} must be at least {{#limit}} characters long',
  'string.max': '{{#label}} must be at most {{#limit}} characters long',
  'string.pattern.base': '{{#label}} does not match the required format',
  'string.pattern.name': '{{#label}} does not match the required format',
  'string.uri': '{{#label}} must be a valid URI',
  'string.uriCustomScheme': '{{#label}} must be a valid URI using one of the accepted schemes',
  'string.trim': '{{#label}} must not contain leading or trailing whitespace',
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
      { is: 'staging', then: branches.production },
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
 * Canonical Joi validation options used both at module bootstrap and in unit
 * tests. Exporting them here guarantees every consumer validates with the
 * same settings.
 *
 *  - `abortEarly: false`  — report every invalid variable, not just the first
 *  - `allowUnknown: true` — don't fail on keys the schema doesn't declare
 *    (e.g. platform-injected vars like PATH, HOME, CI)
 *  - `convert: true`      — coerce string env-vars to number/boolean so Joi
 *    range checks (port bounds, TTL limits, …) work correctly
 */
export const ENV_VALIDATION_OPTIONS: Joi.ValidationOptions = {
  abortEarly: false,
  allowUnknown: true,
  convert: true,
};

/**
 * Parses `CORS_ORIGIN` into the shape `main.ts` expects: either the literal
 * wildcard `'*'` or a list of concrete origins.
 *
 * In production / staging `'*'` is explicitly rejected: a wildcard bypasses
 * the Same-Origin policy and, when combined with `credentials: true`, lets
 * any attacker site read authenticated responses (see CORS security advisory
 * #662).
 */
function parseCorsOrigin(
  value: string,
  helpers: Joi.CustomHelpers,
): string | string[] | Joi.ErrorReport {
  const trimmed = value.trim();

  // Wildcard is only permitted outside production/staging.
  if (trimmed === '*') {
    const env = (helpers.state.ancestors?.[0] as Record<string, unknown>)?.NODE_ENV;
    if (env === 'production' || env === 'staging') {
      return helpers.error('corsOrigin.wildcardForbidden');
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// Base runtime, persistence, auth and AI configuration
// ─────────────────────────────────────────────────────────────────────────────

export const baseEnvSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid(...NODE_ENVIRONMENTS)
    .default('development')
    .description('Runtime environment for the application'),

  PORT: Joi.number()
    .port()
    .default(3000)
    .description('Port number for the HTTP server'),

  /**
   * Allowed CORS origin(s).
   *
   * - Development / test:  defaults to `'*'` for convenience.
   * - Production / staging: `'*'` is **forbidden**. An explicit comma-separated
   *   list of origins (e.g. `https://rustacademy.xyz,https://www.rustacademy.xyz`)
   *   is required so the API is only accessible from known first-party frontends.
   *
   * The custom parser normalises the value into the shape `main.ts` expects:
   * the literal string `'*'`, a single origin string, or an array of origins.
   */
  CORS_ORIGIN: perEnvironment(
    Joi.string()
      .custom(parseCorsOrigin, 'CORS origin list')
      .messages({
        'corsOrigin.wildcardForbidden':
          'CORS_ORIGIN must not be "*" in production or staging — provide an explicit allow-list of origins',
      }),
    {
      production: Joi.string()
        .invalid('*')
        .required()
        .messages({
          'any.invalid':
            'CORS_ORIGIN must not be "*" in production — provide an explicit allow-list of origins',
          'any.required':
            'CORS_ORIGIN is required in production — provide an explicit allow-list of origins',
        }),
      test: Joi.string().default('*'),
      development: Joi.string().default('*'),
    },
  ).description(
    'Allowed CORS origins. Either "*" (non-production only) or a comma-separated ' +
      'list of explicit origins. Production requires an explicit allow-list.',
  ),

  LOCALE: Joi.string().default('en').description('Default localization locale'),

  // ── Persistence ───────────────────────────────────────────────
  DATABASE_URL: perEnvironment(
    secretString().uri({
      scheme: ['postgres', 'postgresql', 'mysql', 'sqlite', 'file'],
    }),
    {
      production: Joi.string().required(),
      test: Joi.string().default(NON_PRODUCTION_DEFAULTS.test.DATABASE_URL),
      development: Joi.string().default(
        NON_PRODUCTION_DEFAULTS.development.DATABASE_URL,
      ),
    },
  ).description(
    'Database connection URL. Mandatory in production — the service refuses ' +
      'to boot without persistence configured.',
  ),

  DB_SYNCHRONIZE: Joi.boolean()
    .when('NODE_ENV', {
      is: 'development',
      then: Joi.boolean().default(true),
      otherwise: Joi.boolean().valid(false).default(false),
    })
    .description(
      'TypeORM schema synchronization. Enabled only in development; forced ' +
        'to false in production-like environments — use migrations instead.',
    ),

  REDIS_HOST: perEnvironment(Joi.string().hostname(), {
    production: Joi.string().required(),
    test: Joi.string().default('localhost'),
    development: Joi.string().default('localhost'),
  }).description(
    'Redis host used for caching and background jobs. Mandatory in ' +
      'production so a deployment never silently falls back to localhost.',
  ),

  REDIS_PORT: Joi.number()
    .port()
    .default(6379)
    .description('Redis port number'),

  REDIS_PASSWORD: secretString()
    .allow('')
    .optional()
    .description('Optional Redis password'),

  // ── Authentication ────────────────────────────────────────────
  JWT_SECRET: productionSecret({
    development: NON_PRODUCTION_DEFAULTS.development.JWT_SECRET,
    test: NON_PRODUCTION_DEFAULTS.test.JWT_SECRET,
  }).description(
    'JWT signing secret. Mandatory in production and required to be at ' +
      `least ${MIN_PRODUCTION_SECRET_LENGTH} characters long.`,
  ),

  JWT_EXPIRES_IN: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('1h')
    .description('JWT lifetime, e.g. "30m", "1h", "7d".'),

  API_KEY_SECRET: perEnvironment(secretString().allow(''), {
    production: Joi.string()
      .invalid('', ...FORBIDDEN_PRODUCTION_SECRETS)
      .min(MIN_PRODUCTION_SECRET_LENGTH),
    test: Joi.string(),
    development: Joi.string(),
  })
    .optional()
    .description(
      'Optional secret used to hash issued API keys. When present in ' +
        'production it must meet the same entropy bar as JWT_SECRET.',
    ),

  // ── AI providers ──────────────────────────────────────────────
  AI_PROVIDER: Joi.string()
    .valid('claude', 'openai', 'mock')
    .default('mock')
    .description('Active AI provider implementation'),

  ANTHROPIC_API_KEY: secretString()
    .allow('')
    .optional()
    .when('AI_PROVIDER', {
      is: 'claude',
      then: Joi.string().invalid('').required(),
    })
    .description('Anthropic API key. Required when AI_PROVIDER=claude.'),

  OPENAI_API_KEY: secretString()
    .allow('')
    .optional()
    .when('AI_PROVIDER', {
      is: 'openai',
      then: Joi.string().invalid('').required(),
    })
    .description('OpenAI API key. Required when AI_PROVIDER=openai.'),

  AI_MODEL: optionalString().description('AI model override'),

  AI_MAX_TOKENS: Joi.number()
    .integer()
    .min(1)
    .max(200_000)
    .default(4096)
    .description('Maximum tokens per AI request'),

  AI_TEMPERATURE: Joi.number()
    .min(0)
    .max(2)
    .default(0.7)
    .description('Sampling temperature for AI responses'),

  // ── BA-078: AI provider retry policy ────────────────────────
  /** Maximum retry attempts for transient AI provider failures (429/5xx). */
  AI_RETRY_MAX_ATTEMPTS: Joi.number()
    .integer()
    .min(0)
    .max(10)
    .default(3)
    .description('Maximum retry attempts after a transient AI provider failure.'),

  /** Base backoff delay in ms before the first AI provider retry. */
  AI_RETRY_BASE_DELAY_MS: Joi.number()
    .integer()
    .min(0)
    .max(60_000)
    .default(250)
    .description('Base exponential-backoff delay in ms for AI provider retries.'),

  /** Upper bound in ms for AI provider retry backoff. */
  AI_RETRY_MAX_DELAY_MS: Joi.number()
    .integer()
    .min(1)
    .max(300_000)
    .default(5_000)
    .description('Maximum backoff delay in ms for AI provider retries.'),

  /** Version identifier for the active chat prompt template set (#374). */
  AI_PROMPT_TEMPLATE_VERSION: Joi.string()
    .pattern(/^\d+\.\d+\.\d+$/)
    .default('1.0.0')
    .description(
      'Semantic version of the chat prompt template set. ' +
        'Changing this allows controlled rollout of new prompt designs.',
    ),

  /** Maximum messages retained in chat history before summarisation (#372). */
  AI_MAX_CHAT_HISTORY_LENGTH: Joi.number()
    .integer()
    .min(10)
    .max(500)
    .default(50)
    .description(
      'When chat history exceeds this length, older messages are ' +
        'compacted into a conversation summary to control token usage.',
    ),

  /** Path to prompt template configuration file (#374). */
  AI_PROMPT_TEMPLATE_PATH: Joi.string()
    .default('config/prompt-templates.json')
    .description('Path to the versioned prompt template configuration file.'),

  // ── Cron schedules ────────────────────────────────────────────
  CRON_CLEANUP_SCHEDULE: Joi.string().default('0 0 * * *'),
  CRON_ANALYTICS_SCHEDULE: Joi.string().default('0 */6 * * *'),
  CRON_NOTIFICATIONS_SCHEDULE: Joi.string().default('*/30 * * * *'),
  CRON_CONTRACT_REPLAY_SCHEDULE: optionalString(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Asset storage & upload quotas (see AssetsService)
// ─────────────────────────────────────────────────────────────────────────────

export const assetEnvSchema = Joi.object({
  ASSETS_UPLOAD_DIR: Joi.string()
    .default('./data/uploads')
    .description('Directory where uploaded assets are persisted on disk'),

  ASSETS_STATIC_DIR: Joi.string()
    .default('./public')
    .description('Read-only static asset directory served at /static'),

  ASSETS_BASE_URL: Joi.string()
    .default('/api/v1/assets')
    .description('Base URL advertised inside asset metadata'),

  ASSETS_MAX_SIZE_MB: Joi.number()
    .greater(0)
    .max(1024)
    .default(10)
    .description('Maximum size of a single uploaded asset, in megabytes'),

  ASSETS_MAX_TOTAL_MB: Joi.number()
    .greater(0)
    .default(1024)
    .description('Aggregate byte quota across all stored assets, in megabytes'),

  ASSETS_MAX_COUNT: Joi.number()
    .integer()
    .min(1)
    .default(10_000)
    .description('Maximum number of assets retained by the registry'),

  ASSET_SIGNING_SECRET: productionSecret({
    development: NON_PRODUCTION_DEFAULTS.development.ASSET_SIGNING_SECRET,
    test: NON_PRODUCTION_DEFAULTS.test.ASSET_SIGNING_SECRET,
  }).description(
    'HMAC secret used to sign asset download URLs. Mandatory in production ' +
      'because an empty secret makes signed URLs forgeable.',
  ),

  ASSET_SIGNED_URL_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(86_400)
    .default(3600)
    .description('Default lifetime of a signed asset URL, in seconds'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Contract ingestion / registry / replay (#393 – #396)
// ─────────────────────────────────────────────────────────────────────────────

export const contractEnvSchema = Joi.object({
  CERTIFICATE_BASE_URL: Joi.string()
    .uri()
    .default('https://rustacademy.xyz/certificates')
    .description(
      'Base URL used to construct shareable certificate verification links.',
    ),

  CONTRACT_INGESTION_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('false')
    .description('Must be explicitly "true" to enable contract ingestion.'),

  CONTRACT_REGISTRY_REQUIRE_SCHEMA: Joi.string()
    .valid('true', 'false')
    .default('true')
    .description(
      'When "true", contract registry entries must pass schema compatibility validation.',
    ),

  CONTRACT_EVENT_REPLAY_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('false')
    .description('When "true", contract event replay endpoints are available.'),

  CONTRACT_ADAPTER_MODE: Joi.string()
    .valid('native', 'stellar', 'mock')
    .default('mock')
    .description('Determines which contract adapter implementation is used.'),

  CONTRACT_NETWORK: Joi.string()
    .valid('testnet', 'futurenet', 'mainnet')
    .default('testnet')
    .description('Stellar network target for contract deployments.'),

  STELLAR_HORIZON_URL: Joi.string()
    .uri()
    .allow('')
    .optional()
    .description('Stellar Horizon server URL for contract queries.'),

  CONTRACT_REGISTRY_MAX_ENTRIES: Joi.number()
    .integer()
    .min(1)
    .default(1000)
    .description('Maximum number of entries held in the contract registry.'),

  CONTRACT_SCHEMA_VERSION: Joi.string()
    .pattern(/^\d+\.\d+\.\d+$/)
    .default('1.0.0')
    .description('Minimum required contract schema version.'),

  CONTRACT_REPLAY_MAX_EVENTS: Joi.number()
    .integer()
    .min(1)
    .max(10_000)
    .default(1000)
    .description('Maximum number of events replayed in a single request.'),

  CONTRACT_EVENT_RETENTION_DAYS: Joi.number()
    .integer()
    .min(1)
    .max(365)
    .default(90)
    .description('Number of days to retain contract event logs for replay.'),

  // ── Attachment scanning configuration — Issue #365 ────────────
  MAX_ATTACHMENT_SIZE_BYTES: Joi.number()
    .integer()
    .min(1)
    .default(10_485_760)
    .description('Maximum allowed attachment file size in bytes (default: 10 MB).'),

  ALLOWED_ATTACHMENT_TYPES: optionalString().description(
    'Comma-separated list of allowed MIME types for submission attachments. ' +
      'Example: "application/pdf,image/png,text/plain"',
  ),

  ATTACHMENT_SCANNING_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('true')
    .description(
      'When "true", submission attachments are scanned for policy violations.',
    ),

  // ── Readiness probe configuration — Issue #376 ────────────────
  READINESS_PROBE_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .default(5_000)
    .description('Timeout for readiness probe dependency checks in milliseconds.'),

  // ── Task orchestrator configuration — Issue #364 ──────────────
  TASK_ORCHESTRATOR_MAX_RETRIES: Joi.number()
    .integer()
    .min(0)
    .default(3)
    .description('Maximum number of retry attempts for scheduled tasks.'),

  TASK_ORCHESTRATOR_BASE_BACKOFF_MS: Joi.number()
    .integer()
    .min(100)
    .default(1_000)
    .description('Base backoff time in milliseconds before task retries.'),

  TASK_ORCHESTRATOR_MAX_BACKOFF_MS: Joi.number()
    .integer()
    .min(100)
    .default(30_000)
    .description('Maximum backoff time in milliseconds for task retries.'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Background jobs & dead-letter queue
// ─────────────────────────────────────────────────────────────────────────────

export const jobEnvSchema = Joi.object({
  MAX_JOB_RETRIES: Joi.number().integer().min(0).max(10).default(3),
  JOB_RETRY_DELAY_MS: Joi.number().integer().min(100).default(5000),
  DLQ_TTL_SECONDS: Joi.number().integer().min(60).default(604800),
  EXPORT_NOTIFICATION_ENABLED: Joi.boolean().default(true),
  EXPORT_RETRY_MAX: Joi.number().integer().min(0).max(10).default(3),
  SIGNED_URL_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(86400)
    .default(3600),
});

// ─────────────────────────────────────────────────────────────────────────────
// Notification delivery and preferences (#385)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Environment variables for notification delivery and preferences (#385).
 */
export const notificationEnvSchema = Joi.object({
  /** When "true", user notification preferences are enforced before delivery */
  NOTIFICATION_ENFORCE_PREFERENCES: Joi.string()
    .valid('true', 'false')
    .default('true')
    .description(
      'When "true", notification delivery checks user preferences first. ' +
        'Set to "false" to bypass preference checks for critical system alerts.',
    ),
  NOTIFICATION_DEFAULT_CHANNEL: Joi.string()
    .valid('email', 'push', 'in-app', 'all')
    .default('all')
    .description(
      'Default notification channel for users without explicit preferences.',
    ),
});

/**
 * Environment variables for migration safety and ordering.
 */
export const migrationEnvSchema = Joi.object({
  MIGRATION_LOCK_TIMEOUT: Joi.number()
    .integer()
    .min(1000)
    .default(300_000)
    .description('Timeout in ms for acquiring a migration lock (default 5 min).'),

  MIGRATION_RETRY_ATTEMPTS: Joi.number()
    .integer()
    .min(0)
    .max(10)
    .default(3)
    .description('Maximum retry attempts for failed migrations.'),

  MIGRATION_STRICT_ORDERING: Joi.string()
    .valid('true', 'false')
    .default('true')
    .description(
      'When "true", migrations must be applied strictly in dependency order.',
    ),

  MIGRATION_REQUIRE_PREFLIGHT: Joi.string()
    .valid('true', 'false')
    .default('true')
    .description(
      'When "true", preflight validation must pass before migrations execute.',
    ),
});

/**
 * Environment variables for the Stellar network configuration (BA-090).
 *
 * These variables let the wallet service validate addresses, issuer, asset
 * codes, network passphrase, and Horizon consistently with the environment
 * the backend was started in.
 */
export const stellarEnvSchema = Joi.object({
  /** Stellar network the backend targets. */
  STELLAR_NETWORK: Joi.string()
    .valid('testnet', 'futurenet', 'mainnet', 'public', 'custom')
    .default('testnet')
    .description('Stellar network target.'),

  /** Network passphrase that must match `STELLAR_NETWORK`. */
  STELLAR_NETWORK_PASSPHRASE: Joi.string()
    .valid(
      'Test SDF Network ; September 2015',
      'Public Global Stellar Network ; September 2015',
      'Standalone Network ; February 2017',
    )
    .default('Test SDF Network ; September 2015')
    .description(
      'Stellar network passphrase. Must match the configured network.',
    ),

  /** Horizon server URL used to query balances and validate transactions. */
  STELLAR_HORIZON_URL: Joi.string()
    .uri()
    .optional()
    .description('Horizon server URL for Stellar queries.'),

  /**
   * Comma-separated `assetCode:issuer` allow-list for transactions,
   * e.g. `XLM:native,USDC:GCGAC2ZAAYZLT...`. Native XLM uses `native`.
   */
  STELLAR_ALLOWED_ASSETS: Joi.string()
    .optional()
    .description('Allowed assetCode:issuer pairs (comma-separated).'),
});

/**
 * Combined validation schema that includes base, contract, migration,
 * notification, and stellar environment variables.
 * Used by config.module.ts to validate all env vars at startup.
 */
export const envValidationSchema = baseEnvSchema
  .concat(assetEnvSchema)
  .concat(contractEnvSchema)
  .concat(jobEnvSchema)
  .concat(migrationEnvSchema)
  .concat(notificationEnvSchema)
  .concat(stellarEnvSchema);
