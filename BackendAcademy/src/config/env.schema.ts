import * as Joi from 'joi';

export const envSchema = Joi.object({
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  CORS_ORIGIN: Joi.string().optional(),
  DATABASE_URL: Joi.string().optional(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  JWT_SECRET: Joi.string().optional(),
  AI_PROVIDER: Joi.string().valid('claude', 'openai', 'mock').default('mock'),
  ANTHROPIC_API_KEY: Joi.string().optional(),
  OPENAI_API_KEY: Joi.string().optional(),
  AI_MODEL: Joi.string().optional(),
  AI_MAX_TOKENS: Joi.number().default(4096),
  AI_TEMPERATURE: Joi.number().default(0.7),
  LOCALE: Joi.string().default('en'),
  CRON_CLEANUP_SCHEDULE: Joi.string().default('0 0 * * *'),
  CRON_ANALYTICS_SCHEDULE: Joi.string().default('0 */6 * * *'),
  CRON_NOTIFICATIONS_SCHEDULE: Joi.string().default('*/30 * * * *'),
  ERROR_LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('error'),
  ERROR_METRICS_ENABLED: Joi.boolean().default(true),
  ERROR_CODES_FILE_PATH: Joi.string().optional(),
  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),
  RATE_LIMIT_MAX: Joi.number().default(100),
});

export interface ErrorConfig {
  ERROR_LOG_LEVEL: string;
  ERROR_METRICS_ENABLED: boolean;
  ERROR_CODES_FILE_PATH?: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX: number;
}
  ANALYTICS_BATCH_SIZE: Joi.number().default(100),
  ANALYTICS_MAX_PAYLOAD_SIZE: Joi.number().default(1048576),
  ANALYTICS_RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),
  ANALYTICS_RATE_LIMIT_MAX: Joi.number().default(100),
  ANALYTICS_RETENTION_DAYS: Joi.number().default(30),
});

export interface AnalyticsEnvConfig {
  ANALYTICS_BATCH_SIZE: number;
  ANALYTICS_MAX_PAYLOAD_SIZE: number;
  ANALYTICS_RATE_LIMIT_WINDOW_MS: number;
  ANALYTICS_RATE_LIMIT_MAX: number;
  ANALYTICS_RETENTION_DAYS: number;
}

  ASSETS_UPLOAD_DIR: Joi.string().optional(),
  ASSETS_BASE_URL: Joi.string().optional(),
  ASSETS_MAX_SIZE_MB: Joi.number().optional(),
  ASSET_SIGNING_SECRET: Joi.string().min(16).required().description('HMAC secret for signing asset URLs'),
  ASSET_SIGNED_URL_TTL_SECONDS: Joi.number().default(3600).description('Default TTL for signed asset URLs'),
  ASSET_URL_SCOPES: Joi.string().default('read').valid('read', 'write', 'admin'),

  DEFAULT_REQUEST_TIMEOUT_MS: Joi.number().default(30000).description('Global outbound request timeout in ms'),
  WEBHOOK_MAX_RETRIES: Joi.number().default(5).description('Maximum webhook delivery retry attempts'),
  WEBHOOK_BASE_BACKOFF_MS: Joi.number().default(1000).description('Base backoff for webhook retries in ms'),
  WEBHOOK_MAX_BACKOFF_MS: Joi.number().default(60000).description('Maximum backoff for webhook retries in ms'),
  WEBHOOK_SIGNATURE_SECRET: Joi.string().optional().description('HMAC secret for verifying webhook signatures'),
  WEBHOOK_IDEMPOTENCY_TTL_SECONDS: Joi.number().default(3600).description('TTL for webhook idempotency keys'),
  WEBHOOK_SIGNATURE_SECRET: Joi.string().optional().description('Secret for webhook HMAC signatures'),
  WEBHOOK_IDEMPOTENCY_TTL_SECONDS: Joi.number().default(3600).description('TTL for webhook idempotency keys in Redis'),
// ---------------------------------------------------------------------------
// Shared coercion helpers
//
// All list / boolean / JSON environment values MUST be declared here so they
// are parsed once, identically, regardless of where the process runs
// (local `.env`, Docker, CI, Kubernetes). Consumers should read values via
// `ConfigService`, which returns the coerced value from this schema.
// ---------------------------------------------------------------------------

/** Coerces a comma-separated string into a trimmed, non-empty string array. */
export const csvList = (): Joi.Schema =>
  Joi.custom((value: unknown, helpers) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') {
      return helpers.error('string.base');
    }
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }, 'comma-separated list');

/** Strict boolean that accepts the usual env spellings only. */
export const booleanString = (): Joi.BooleanSchema =>
  Joi.boolean().truthy('1', 'yes', 'on').falsy('0', 'no', 'off');

/** Parses a JSON object/array from a string env value. */
export const jsonValue = (): Joi.Schema =>
  Joi.custom((value: unknown, helpers) => {
    if (typeof value === 'object' && value !== null) return value;
    if (typeof value !== 'string') {
      return helpers.error('string.base');
    }
    try {
      return JSON.parse(value);
    } catch {
      return helpers.error('any.invalid');
    }
  }, 'JSON value');

/**
 * `CORS_ORIGIN` supports either the wildcard `*` or a comma-separated list
 * of origins (e.g. `https://a.com,https://b.com`).
 */
const corsOrigin = Joi.alternatives().try(Joi.string().valid('*'), csvList());

export const validationSchema = Joi.object({
  // Server
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  // Database
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  // Auth
  JWT_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  JWT_REFRESH_SECRET: Joi.string().optional(),
  /** Access token TTL in seconds. */
  JWT_ACCESS_EXPIRES_IN: Joi.number().integer().positive().default(900),
  /** Refresh token TTL in seconds. */
  JWT_REFRESH_EXPIRES_IN: Joi.number().integer().positive().default(604_800),

  // API Keys
  API_KEY_SECRET: Joi.string().optional(),

  // CORS
  CORS_ORIGIN: corsOrigin.default('*'),

  // Rate limiting
  THROTTLE_TTL_MS: Joi.number().integer().positive().default(60_000),
  THROTTLE_LIMIT: Joi.number().integer().positive().default(10),

  // AI Provider
  AI_PROVIDER: Joi.string().valid('claude', 'openai', 'mock').default('mock'),
  ANTHROPIC_API_KEY: Joi.string().allow('').optional(),
  OPENAI_API_KEY: Joi.string().allow('').optional(),
  AI_MODEL: Joi.string().allow('').optional(),
  AI_MAX_TOKENS: Joi.number().integer().positive().default(4096),
  AI_TEMPERATURE: Joi.number().min(0).max(2).default(0.7),

  // Static & uploaded assets
  ASSETS_UPLOAD_DIR: Joi.string().default('./data/uploads'),
  ASSETS_MAX_SIZE_MB: Joi.number().positive().default(10),
  ASSETS_BASE_URL: Joi.string().default('/api/v1/assets'),
  ASSETS_STATIC_DIR: Joi.string().default('./public'),

  // ── Notification delivery providers (#388) ──────────────────

  /** Comma-separated list of enabled notification providers (email, push, in-app). */
  NOTIFICATION_PROVIDERS: csvList()
    .items(Joi.string().valid('email', 'push', 'in-app'))
    .default(['email', 'push', 'in-app']),

  // ── Notification batching (#386) ────────────────────────────

  /** Enable low-priority notification batching. */
  NOTIFICATION_BATCH_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('false'),

  /** Max notifications per batch. */
  NOTIFICATION_BATCH_MAX_SIZE: Joi.number().integer().positive().default(10),

  /** Batch window in milliseconds before auto-flush. */
  NOTIFICATION_BATCH_WINDOW_MS: Joi.number().integer().positive().default(30_000),

  // ── Email provider (#387, #388) ─────────────────────────────

  /** Default "from" address for outgoing email. */
  EMAIL_FROM_ADDRESS: Joi.string().email().default('noreply@rustacademy.to'),

  /** Default sender display name. */
  EMAIL_FROM_NAME: Joi.string().default('RustAcademy'),

  /** Default fallback name for missing personalization fields. */
  EMAIL_FALLBACK_NAME: Joi.string().default('RustAcademy Learner'),
});
