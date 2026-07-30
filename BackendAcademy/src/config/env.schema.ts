import * as Joi from 'joi';

export const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development')
    .description('Runtime environment for the application'),

  PORT: Joi.number()
    .port()
    .default(3000)
    .description('Port number for the HTTP server'),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql', 'mysql', 'sqlite', 'http', 'https'] })
    .optional()
    .description('Database connection URL'),

  // ── AI Prompt Templates (#374) ─────────────────────────────
  /** Version identifier for the active chat prompt template set */
  AI_PROMPT_TEMPLATE_VERSION: Joi.string()
    .pattern(/^\d+\.\d+\.\d+$/)
    .default('1.0.0')
    .description(
      'Semantic version of the chat prompt template set. ' +
        'Changing this allows controlled rollout of new prompt designs.',
    ),
  /** Maximum number of messages retained in chat history before summarisation (#372) */
  AI_MAX_CHAT_HISTORY_LENGTH: Joi.number()
    .integer()
    .min(10)
    .max(500)
    .default(50)
    .description(
      'When chat history exceeds this length, older messages are ' +
        'compacted into a conversation summary to control token usage.',
    ),
  /** Path to prompt template configuration file (#374) */
  AI_PROMPT_TEMPLATE_PATH: Joi.string()
    .default('config/prompt-templates.json')
    .description('Path to the versioned prompt template configuration file.'),

  // ── Cron schedules ──────────────────────────────────────────
  CRON_CLEANUP_SCHEDULE: Joi.string().default('0 0 * * *'),
  CRON_ANALYTICS_SCHEDULE: Joi.string().default('0 */6 * * *'),
  CRON_NOTIFICATIONS_SCHEDULE: Joi.string().default('*/30 * * * *'),
  CRON_CONTRACT_REPLAY_SCHEDULE: Joi.string().optional(),
});

/**
 * Environment variable schema that enforces explicit feature flags
 * for contract ingestion and processing.
 */
export const contractEnvSchema = Joi.object({
  CERTIFICATE_BASE_URL: Joi.string()
    .uri()
    .default('https://rustacademy.xyz/certificates')
    .description('Base URL used to construct shareable certificate verification links.'),

  CONTRACT_INGESTION_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('false')
    .description('Must be explicitly "true" to enable contract ingestion.'),

  CONTRACT_REGISTRY_REQUIRE_SCHEMA: Joi.string()
    .valid('true', 'false')
    .default('true')
    .description('When "true", contract registry entries must pass schema compatibility validation.'),

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
    .optional()
    .description('Stellar Horizon server URL for contract queries.'),

  CONTRACT_REGISTRY_MAX_ENTRIES: Joi.number()
  REDIS_HOST: Joi.string()
    .default('localhost')
    .description('Redis host used for caching and background jobs'),

  REDIS_PORT: Joi.number()
    .integer()
    .min(1)
    .max(365)
    .default(90)
    .description('Number of days to retain contract event logs for replay.'),

  // ── Attachment scanning configuration — Issue #365 ──────────────
  /** Maximum allowed attachment file size in bytes */
  MAX_ATTACHMENT_SIZE_BYTES: Joi.number()
    .integer()
    .min(1)
    .default(10_485_760)
    .description('Maximum allowed attachment file size in bytes (default: 10 MB).'),

  /** Comma-separated list of allowed MIME types for attachments */
  ALLOWED_ATTACHMENT_TYPES: Joi.string()
    .optional()
    .description(
      'Comma-separated list of allowed MIME types for submission attachments. ' +
        'Example: "application/pdf,image/png,text/plain"',
    ),

  /** Whether attachment content policy scanning is enabled */
  ATTACHMENT_SCANNING_ENABLED: Joi.string()
    .valid('true', 'false')
    .default('true')
    .description('When "true", submission attachments are scanned for policy violations.'),

  // ── Readiness probe configuration — Issue #376 ──────────────────
  /** Timeout for readiness probe checks in milliseconds */
  READINESS_PROBE_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .default(5_000)
    .description('Timeout for readiness probe dependency checks in milliseconds.'),

  CONTRACT_SCHEMA_VERSION: Joi.string()
    .pattern(/^\d+\.\d+\.\d+$/)
    .default('1.0.0')
    .description('Minimum required contract schema version.'),

  CONTRACT_REPLAY_MAX_EVENTS: Joi.number()
  // ── Task orchestrator configuration — Issue #364 ────────────────
  /** Maximum retries for task orchestration */
  TASK_ORCHESTRATOR_MAX_RETRIES: Joi.number()
    .integer()
    .min(0)
    .default(3)
    .description('Maximum number of retry attempts for scheduled tasks.'),

  /** Base backoff time in milliseconds for task retries */
  TASK_ORCHESTRATOR_BASE_BACKOFF_MS: Joi.number()
    .integer()
    .min(100)
    .default(1_000)
    .description('Base backoff time in milliseconds before task retries.'),

  CONTRACT_EVENT_RETENTION_DAYS: Joi.number()
  /** Maximum backoff time in milliseconds for task retries */
  TASK_ORCHESTRATOR_MAX_BACKOFF_MS: Joi.number()
    .integer()
    .min(100)
    .default(30_000)
    .description('Maximum backoff time in milliseconds for task retries.'),
});

export const jobEnvSchema = Joi.object({
  MAX_JOB_RETRIES: Joi.number().integer().min(0).max(10).default(3),
  JOB_RETRY_DELAY_MS: Joi.number().integer().min(100).default(5000),
  DLQ_TTL_SECONDS: Joi.number().integer().min(60).default(604800),
  EXPORT_NOTIFICATION_ENABLED: Joi.boolean().default(true),
  EXPORT_RETRY_MAX: Joi.number().integer().min(0).max(10).default(3),
  SIGNED_URL_TTL_SECONDS: Joi.number().integer().min(60).max(86400).default(3600),
});

export type JobEnvConfig = {
  MAX_JOB_RETRIES: number;
  JOB_RETRY_DELAY_MS: number;
  DLQ_TTL_SECONDS: number;
  EXPORT_NOTIFICATION_ENABLED: boolean;
  EXPORT_RETRY_MAX: number;
  SIGNED_URL_TTL_SECONDS: number;
};

export type ContractEnvConfig = {
  CERTIFICATE_BASE_URL: string;
  CONTRACT_INGESTION_ENABLED: string;
  CONTRACT_REGISTRY_REQUIRE_SCHEMA: string;
  CONTRACT_EVENT_REPLAY_ENABLED: string;
  CONTRACT_ADAPTER_MODE: string;
  CONTRACT_NETWORK: string;
  STELLAR_HORIZON_URL?: string;
  CONTRACT_REGISTRY_MAX_ENTRIES: number;
  CONTRACT_SCHEMA_VERSION: string;
  CONTRACT_REPLAY_MAX_EVENTS: number;
  CONTRACT_EVENT_RETENTION_DAYS: number;
  MAX_ATTACHMENT_SIZE_BYTES: number;
  ALLOWED_ATTACHMENT_TYPES?: string;
  ATTACHMENT_SCANNING_ENABLED: string;
  READINESS_PROBE_TIMEOUT_MS: number;
  TASK_ORCHESTRATOR_MAX_RETRIES: number;
  TASK_ORCHESTRATOR_BASE_BACKOFF_MS: number;
  TASK_ORCHESTRATOR_MAX_BACKOFF_MS: number;
};

export function isFeatureEnabled(value: string | undefined): boolean {
  return value === 'true';
}

export function isFeatureExplicitlyDisabled(value: string | undefined): boolean {
  return value === 'false';
}

/**
 * Environment variables for notification delivery and preferences (#385).
 */
export const notificationEnvSchema = Joi.object({
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
    .description('Default notification channel for users without explicit preferences.'),
});

/**
 * Environment variables for migration safety and ordering (#397).
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
    .description('When "true", preflight validation must pass before migrations execute.'),
});

/**
 * Combined validation schema that includes base, contract, migration,
 * and notification environment variables.
 * Used by config.module.ts to validate all env vars at startup.
 */
export const validationSchema = baseEnvSchema
  .concat(contractEnvSchema)
  .concat(migrationEnvSchema)
  .concat(notificationEnvSchema);
    .max(65535)
    .default(6379)
    .description('Redis port number'),

  JWT_SECRET: Joi.string()
    .min(10)
    .optional()
    .description('JWT signing secret for authentication tokens'),
})
  .unknown(false)
  .options({ abortEarly: false });
