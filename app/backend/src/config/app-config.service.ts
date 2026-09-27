import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { EnvConfig } from "./env.schema";
import { randomBytes } from "crypto";

/**
 * Typed configuration service with centralized accessors for environment variables.
 * All environment variables are validated at startup via Joi schema.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  /**
   * Get the server port
   */
  get port(): number {
    return this.configService.get("PORT", { infer: true });
  }

  /**
   * Get the Stellar network (testnet or mainnet)
   */
  get network(): "testnet" | "mainnet" {
    return this.configService.get("NETWORK", { infer: true });
  }

  /**
   * Get the Supabase URL
   */
  get supabaseUrl(): string {
    return this.configService.get("SUPABASE_URL", { infer: true });
  }

  /**
   * Get the Supabase anonymous key
   */
  get supabaseAnonKey(): string {
    return this.configService.get("SUPABASE_ANON_KEY", { infer: true });
  }

  /**
   * HMAC secret for wallet access tokens (#549).
   *
   * Falls back to a per-process random secret when unset. That keeps local
   * development working, but it means access tokens do not survive a restart
   * and are not valid across instances — set the variable in any deployment
   * running more than one process.
   */
  get walletAuthAccessTokenSecret(): string {
    return (
      this.configService.get("WALLET_AUTH_ACCESS_TOKEN_SECRET", {
        infer: true,
      }) ?? randomBytes(32).toString("hex")
    );
  }

  /** Wallet access-token lifetime in seconds. */
  get walletAuthAccessTtlSeconds(): number {
    return this.configService.get("WALLET_AUTH_ACCESS_TTL_SECONDS", {
      infer: true,
    });
  }

  /** Wallet login challenge lifetime in seconds. */
  get walletAuthNonceTtlSeconds(): number {
    return this.configService.get("WALLET_AUTH_NONCE_TTL_SECONDS", {
      infer: true,
    });
  }

  /** Absolute wallet session lifetime in seconds. */
  get walletAuthRefreshTtlSeconds(): number {
    return this.configService.get("WALLET_AUTH_REFRESH_TTL_SECONDS", {
      infer: true,
    });
  }

  /**
   * Get the Node environment
   */
  get nodeEnv(): "development" | "production" | "test" {
    return this.configService.get("NODE_ENV", { infer: true });
  }

  /**
   * Check if running in development mode
   */
  get isDevelopment(): boolean {
    return this.nodeEnv === "development";
  }

  /**
   * Check if running in production mode
   */
  get isProduction(): boolean {
    return this.nodeEnv === "production";
  }

  /**
   * Get the explicit environment name
   */
  get environmentName():
    | "development"
    | "staging"
    | "production"
    | "test"
    | undefined {
    return this.configService.get("ENVIRONMENT_NAME", { infer: true });
  }

  /**
   * Check if running in staging environment
   */
  get isStaging(): boolean {
    return this.environmentName === "staging";
  }

  /**
   * Environment parity check configuration
   */
  get envParityCheckEnabled(): boolean {
    return this.configService.get("ENV_PARITY_CHECK_ENABLED", { infer: true });
  }

  /**
   * Production base URL for parity comparison
   */
  get productionBaseUrl(): string | undefined {
    return this.configService.get("PRODUCTION_BASE_URL", { infer: true });
  }

  /**
   * Shadow traffic configuration
   */
  get shadowTrafficEnabled(): boolean {
    return this.configService.get("SHADOW_TRAFFIC_ENABLED", { infer: true });
  }

  /**
   * Shadow traffic sample rate (0.0 to 1.0)
   */
  get shadowTrafficSampleRate(): number {
    return this.configService.get("SHADOW_TRAFFIC_SAMPLE_RATE", {
      infer: true,
    });
  }

  /**
   * Comma-separated list of endpoints to shadow
   */
  get shadowTrafficEndpoints(): string {
    return this.configService.get("SHADOW_TRAFFIC_ENDPOINTS", { infer: true });
  }

  /**
   * Check if staging data seeding is enabled
   */
  get stagingSeedDataEnabled(): boolean {
    return this.configService.get("STAGING_SEED_DATA_ENABLED", { infer: true });
  }

  /**
   * Parsed list of explicitly allowed CORS origins.
   * Sourced from the CORS_ALLOWED_ORIGINS env var (comma-separated).
   */
  get corsAllowedOrigins(): string[] {
    const raw = this.configService.get("CORS_ALLOWED_ORIGINS", { infer: true });
    return raw
      ? raw
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : [];
  }

  /**
   * Vercel project slug used to allow preview deployment URLs.
   * When set, https://<slug>-*.vercel.app origins are permitted.
   */
  get corsVercelProject(): string | undefined {
    return this.configService.get("CORS_VERCEL_PROJECT", { infer: true });
  }

  /**
   * Check if running on testnet
   */
  get isTestnet(): boolean {
    return this.network === "testnet";
  }

  /**
   * Check if running on mainnet
   */
  get isMainnet(): boolean {
    return this.network === "mainnet";
  }

  /**
   * Max usernames per wallet (optional). When not set, returns undefined (no limit).
   */
  get maxUsernamesPerWallet(): number | undefined {
    return this.configService.get("MAX_USERNAMES_PER_WALLET", { infer: true });
  }

  /**
   * Maximum number of items to cache for transactions
   */
  get cacheMaxItems(): number {
    return this.configService.get("CACHE_MAX_ITEMS", { infer: true });
  }

  /**
   * Cache TTL in milliseconds for transaction responses
   */
  get cacheTtlMs(): number {
    return this.configService.get("CACHE_TTL_MS", { infer: true });
  }

  get featureFlagsCacheTtlMs(): number {
    return this.configService.get("FEATURE_FLAGS_CACHE_TTL_MS", {
      infer: true,
    });
  }

  get featureFlagsBootstrapJson(): string | undefined {
    return this.configService.get("FEATURE_FLAGS_BOOTSTRAP_JSON", {
      infer: true,
    });
  }

  /**
   * Max records processed per entity type per reconciliation run
   */
  get reconciliationBatchSize(): number {
    return this.configService.get("RECONCILIATION_BATCH_SIZE", { infer: true });
  }

  /**
   *  RustAcademy Soroban contract id (optional). Used for ingestion and soroban preflight.
   */
  get RustAcademyContractId(): string | undefined {
    return this.configService.get("RustAcademy_CONTRACT_ID", { infer: true });
  }

  /**
   * Explicit ingestion boot gate.
   * Contract ingestion only starts automatically when this flag is enabled.
   */
  get ingestionEnabled(): boolean {
    return this.configService.get("INGESTION_ENABLED", { infer: true });
  }

  /**
   * Sentry DSN for error reporting. Undefined means Sentry is disabled.
   */
  get sentryDsn(): string | undefined {
    return this.configService.get("SENTRY_DSN", { infer: true });
  }

  /**
   * Supabase service role key (optional). Used for admin database operations.
   */
  get supabaseServiceRoleKey(): string | undefined {
    return this.configService.get("SUPABASE_SERVICE_ROLE_KEY", { infer: true });
  }

  /**
   * Custom Horizon URL (optional). Overrides network default if provided.
   */
  get horizonUrl(): string | undefined {
    return this.configService.get("HORIZON_URL", { infer: true });
  }

  get sorobanRpcUrl(): string | undefined {
    return this.configService.get("SOROBAN_RPC_URL", { infer: true });
  }

  get stellarExplorerUrl(): string | undefined {
    return this.configService.get("STELLAR_EXPLORER_URL", { infer: true });
  }

  /**
   * Stellar public key (optional). The public key corresponding to the signing key.
   */
  get stellarPublicKey(): string | undefined {
    return this.configService.get("STELLAR_PUBLIC_KEY", { infer: true });
  }

  /**
   * True when STELLAR_SECRET_KEY is set and payment signing is available.
   * Use StellarSigningService (not this getter) to perform actual signing.
   */
  get isPaymentSigningConfigured(): boolean {
    return !!this.configService.get("STELLAR_SECRET_KEY", { infer: true });
  }

  /**
   * Indexer lag threshold in ledgers
   */
  get indexerLagThresholdLedgers(): number {
    return this.configService.get("INDEXER_LAG_THRESHOLD_LEDGERS", {
      infer: true,
    });
  }

  /**
   * Whether the indexer lag guard is enabled
   */
  get indexerLagGuardEnabled(): boolean {
    return this.configService.get("INDEXER_LAG_GUARD_ENABLED", { infer: true });
  }

  /**
   * Admin override to disable lag guard temporarily
   */
  get indexerLagGuardOverride(): boolean {
    return this.configService.get("INDEXER_LAG_GUARD_OVERRIDE", {
      infer: true,
    });
  }

  /**
   * Whether the reconciliation module is enabled
   */
  get reconciliationEnabled(): boolean {
    return this.configService.get("FEATURES_RECONCILIATION_ENABLED", {
      infer: true,
    });
  }

  /**
   * Whether the notifications module is enabled
   */
  get notificationsEnabled(): boolean {
    return this.configService.get("FEATURES_NOTIFICATIONS_ENABLED", {
      infer: true,
    });
  }

  /**
    * Whether the developer routes/module is enabled
    */
  get developerRoutesEnabled(): boolean {
    return this.configService.get("FEATURES_DEVELOPER_ROUTES_ENABLED", {
      infer: true,
    });
  }

  /**
   * Supabase Storage bucket for exported files
   */
  get exportStorageBucket(): string | undefined {
    return this.configService.get("EXPORT_STORAGE_BUCKET", { infer: true });
  }

  /**
   * Signed URL expiry for export download links (milliseconds)
   */
  get exportLinkExpiryMs(): number {
    return this.configService.get("EXPORT_LINK_EXPIRY_MS", { infer: true });
  }

  /**
   * HTTP timeout for webhook export delivery (milliseconds)
   */
  get exportWebhookTimeoutMs(): number {
    return this.configService.get("EXPORT_WEBHOOK_TIMEOUT_MS", { infer: true });
  }

  /**
   * Base URL for constructing absolute download links
   */
  get appBaseUrl(): string | undefined {
    return this.configService.get("APP_BASE_URL", { infer: true });
  }

  /**
   * Validates the loaded, typed configuration (dependency state).
   *
   * The Joi schema in `env.schema.ts` validates raw environment variables at
   * boot; this method validates the *loaded* configuration the rest of the
   * application depends on, plus cross-field rules that the schema cannot
   * express (e.g. production CORS posture, signing key consistency). It is
   * invoked from `main.ts` before the HTTP server binds.
   *
   * @returns `errors` must be empty for startup to proceed; `warnings` are
   *   logged but do not block startup.
   */
  validate(): StartupValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required dependencies. Defensive: the Joi schema already enforces these,
    // but a partially loaded ConfigService must never slip through silently.
    if (!this.supabaseUrl) {
      errors.push(
        "SUPABASE_URL is missing — set it (e.g. https://<project>.supabase.co) before starting",
      );
    }
    if (!this.supabaseAnonKey) {
      errors.push(
        "SUPABASE_ANON_KEY is missing — set it before starting",
      );
    }
    if (!this.network) {
      errors.push(
        'NETWORK is missing — set it to "testnet" or "mainnet" before starting',
      );
    }

    // Ingestion safety gate (mirrors the env schema check on loaded values).
    if (this.ingestionEnabled && !this.RustAcademyContractId) {
      errors.push(
        "INGESTION_ENABLED is true but RustAcademy_CONTRACT_ID is not set — set the contract ID or disable ingestion",
      );
    }

    // Payment signing consistency.
    if (this.isPaymentSigningConfigured && !this.stellarPublicKey) {
      warnings.push(
        "STELLAR_SECRET_KEY is set but STELLAR_PUBLIC_KEY is not — signing works, but features that need the public key (e.g. wallet verification) may fail",
      );
    }

    // Production CORS posture: no explicit origins and no Vercel project means
    // every cross-origin browser request will be blocked.
    if (
      this.isProduction &&
      this.corsAllowedOrigins.length === 0 &&
      !this.corsVercelProject
    ) {
      warnings.push(
        "NODE_ENV=production but CORS_ALLOWED_ORIGINS and CORS_VERCEL_PROJECT are both unset — all cross-origin browser requests will be blocked",
      );
    }

    return { errors, warnings };
  }
}

/**
 * Result of {@link AppConfigService.validate}.
 * `errors` must be empty for startup to proceed; `warnings` are advisory.
 */
export interface StartupValidationResult {
  errors: string[];
  warnings: string[];
}
