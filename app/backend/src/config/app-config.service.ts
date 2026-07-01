import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { EnvConfig } from "./env.schema";

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
}
