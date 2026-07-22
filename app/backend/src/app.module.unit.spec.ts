import { EnvironmentModuleLoader } from "./module-factory";
import { EnvConfig, envSchema } from "./config/env.schema";
import { ReconciliationModule } from "./reconciliation/reconciliation.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { DeveloperModule } from "./developer/developer.module";
import { IngestionBootstrapService } from "./ingestion/ingestion-bootstrap.service";

/**
 * Integration tests for AppModule composition.
 * These tests validate that the EnvironmentModuleLoader correctly integrates with AppModule.
 */
describe("AppModule", () => {
  describe("module compilation", () => {
    it("compiles successfully with all feature flags disabled", async () => {
      // Minimal valid env config with all features off
      const minimalEnv: Partial<EnvConfig> = {
        PORT: 4000,
        NETWORK: "testnet",
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_ANON_KEY: "test-key",
        NODE_ENV: "test",
        FEATURES_RECONCILIATION_ENABLED: false,
        FEATURES_NOTIFICATIONS_ENABLED: false,
        FEATURES_DEVELOPER_ROUTES_ENABLED: false,
        INGESTION_ENABLED: false,
      };

      // Validate through the same schema used in app.module.ts
      const validatedEnv = envSchema.validate(minimalEnv, {
        allowUnknown: true,
        abortEarly: false,
      }).value as EnvConfig;

      const loader = new EnvironmentModuleLoader(validatedEnv);

      expect(loader.getModules()).toHaveLength(0);
      expect(loader.getProviders()).toHaveLength(0);
    });

    it("compiles successfully with reconciliation enabled", async () => {
      const envWithReconciliation: Partial<EnvConfig> = {
        PORT: 4000,
        NETWORK: "testnet",
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_ANON_KEY: "test-key",
        NODE_ENV: "test",
        FEATURES_RECONCILIATION_ENABLED: true,
        FEATURES_NOTIFICATIONS_ENABLED: false,
        FEATURES_DEVELOPER_ROUTES_ENABLED: false,
        INGESTION_ENABLED: false,
      };

      const validatedEnv = envSchema.validate(envWithReconciliation, {
        allowUnknown: true,
        abortEarly: false,
      }).value as EnvConfig;

      const loader = new EnvironmentModuleLoader(validatedEnv);
      const modules = loader.getModules();

      expect(modules).toContain(ReconciliationModule);
      expect(modules).not.toContain(NotificationsModule);
      expect(modules).not.toContain(DeveloperModule);
    });

    it("compiles successfully with notifications enabled", async () => {
      const envWithNotifications: Partial<EnvConfig> = {
        PORT: 4000,
        NETWORK: "testnet",
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_ANON_KEY: "test-key",
        NODE_ENV: "test",
        FEATURES_RECONCILIATION_ENABLED: false,
        FEATURES_NOTIFICATIONS_ENABLED: true,
        FEATURES_DEVELOPER_ROUTES_ENABLED: false,
        INGESTION_ENABLED: false,
      };

      const validatedEnv = envSchema.validate(envWithNotifications, {
        allowUnknown: true,
        abortEarly: false,
      }).value as EnvConfig;

      const loader = new EnvironmentModuleLoader(validatedEnv);
      const modules = loader.getModules();

      expect(modules).not.toContain(ReconciliationModule);
      expect(modules).toContain(NotificationsModule);
      expect(modules).not.toContain(DeveloperModule);
    });

    it("compiles successfully with developer routes enabled in non-production", async () => {
      const envWithDeveloper: Partial<EnvConfig> = {
        PORT: 4000,
        NETWORK: "testnet",
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_ANON_KEY: "test-key",
        NODE_ENV: "development",
        FEATURES_RECONCILIATION_ENABLED: false,
        FEATURES_NOTIFICATIONS_ENABLED: false,
        FEATURES_DEVELOPER_ROUTES_ENABLED: true,
        INGESTION_ENABLED: false,
      };

      const validatedEnv = envSchema.validate(envWithDeveloper, {
        allowUnknown: true,
        abortEarly: false,
      }).value as EnvConfig;

      const loader = new EnvironmentModuleLoader(validatedEnv);
      const modules = loader.getModules();

      expect(modules).not.toContain(ReconciliationModule);
      expect(modules).not.toContain(NotificationsModule);
      expect(modules).toContain(DeveloperModule);
    });

    it("includes IngestionBootstrapService when INGESTION_ENABLED is true", async () => {
      const envWithIngestion: Partial<EnvConfig> = {
        PORT: 4000,
        NETWORK: "testnet",
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_ANON_KEY: "test-key",
        NODE_ENV: "test",
        FEATURES_RECONCILIATION_ENABLED: false,
        FEATURES_NOTIFICATIONS_ENABLED: false,
        FEATURES_DEVELOPER_ROUTES_ENABLED: false,
        INGESTION_ENABLED: true,
        RustAcademy_CONTRACT_ID: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
      };

      const validatedEnv = envSchema.validate(envWithIngestion, {
        allowUnknown: true,
        abortEarly: false,
      }).value as EnvConfig;

      const loader = new EnvironmentModuleLoader(validatedEnv);
      const providers = loader.getProviders();

      expect(providers).toContain(IngestionBootstrapService);
    });

    it("compiles successfully with all features enabled in non-production", async () => {
      const envWithAllFeatures: Partial<EnvConfig> = {
        PORT: 4000,
        NETWORK: "testnet",
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_ANON_KEY: "test-key",
        NODE_ENV: "development",
        FEATURES_RECONCILIATION_ENABLED: true,
        FEATURES_NOTIFICATIONS_ENABLED: true,
        FEATURES_DEVELOPER_ROUTES_ENABLED: true,
        INGESTION_ENABLED: true,
        RustAcademy_CONTRACT_ID: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
      };

      const validatedEnv = envSchema.validate(envWithAllFeatures, {
        allowUnknown: true,
        abortEarly: false,
      }).value as EnvConfig;

      const loader = new EnvironmentModuleLoader(validatedEnv);
      const modules = loader.getModules();
      const providers = loader.getProviders();

      expect(modules).toContain(ReconciliationModule);
      expect(modules).toContain(NotificationsModule);
      expect(modules).toContain(DeveloperModule);
      expect(providers).toContain(IngestionBootstrapService);
    });
  });

  describe("production safety checks", () => {
    it("throws when developer routes are enabled in production", () => {
      const productionEnvWithDeveloper: Partial<EnvConfig> = {
        PORT: 4000,
        NETWORK: "mainnet",
        SUPABASE_URL: "https://prod.supabase.co",
        SUPABASE_ANON_KEY: "prod-key",
        NODE_ENV: "production",
        FEATURES_RECONCILIATION_ENABLED: true,
        FEATURES_NOTIFICATIONS_ENABLED: true,
        FEATURES_DEVELOPER_ROUTES_ENABLED: true,
        INGESTION_ENABLED: false,
      };

      const validatedEnv = envSchema.validate(productionEnvWithDeveloper, {
        allowUnknown: true,
        abortEarly: false,
      }).value as EnvConfig;

      expect(() => new EnvironmentModuleLoader(validatedEnv)).toThrow(
        /Developer routes are enabled in production/,
      );
    });

    it("allows production deployment with developer routes disabled", () => {
      const productionEnv: Partial<EnvConfig> = {
        PORT: 4000,
        NETWORK: "mainnet",
        SUPABASE_URL: "https://prod.supabase.co",
        SUPABASE_ANON_KEY: "prod-key",
        NODE_ENV: "production",
        FEATURES_RECONCILIATION_ENABLED: true,
        FEATURES_NOTIFICATIONS_ENABLED: true,
        FEATURES_DEVELOPER_ROUTES_ENABLED: false,
        INGESTION_ENABLED: false,
      };

      const validatedEnv = envSchema.validate(productionEnv, {
        allowUnknown: true,
        abortEarly: false,
      }).value as EnvConfig;

      expect(() => new EnvironmentModuleLoader(validatedEnv)).not.toThrow();

      const loader = new EnvironmentModuleLoader(validatedEnv);
      const modules = loader.getModules();

      expect(modules).toContain(ReconciliationModule);
      expect(modules).toContain(NotificationsModule);
      expect(modules).not.toContain(DeveloperModule);
    });
  });

  describe("EnvironmentModuleLoader integration", () => {
    it("getConfig returns the validated environment config", () => {
      const testConfig: Partial<EnvConfig> = {
        PORT: 4000,
        NETWORK: "testnet",
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_ANON_KEY: "test-key",
        NODE_ENV: "test",
        FEATURES_RECONCILIATION_ENABLED: false,
        FEATURES_NOTIFICATIONS_ENABLED: false,
        FEATURES_DEVELOPER_ROUTES_ENABLED: false,
        INGESTION_ENABLED: false,
      };

      const validatedEnv = envSchema.validate(testConfig, {
        allowUnknown: true,
        abortEarly: false,
      }).value as EnvConfig;

      const loader = new EnvironmentModuleLoader(validatedEnv);

      expect(loader.getConfig()).toBe(validatedEnv);
      expect(loader.getConfig().PORT).toBe(4000);
      expect(loader.getConfig().NETWORK).toBe("testnet");
    });

    it("validates env schema integration with INGESTION_ENABLED requiring RustAcademy_CONTRACT_ID", () => {
      const invalidIngestionConfig: Partial<EnvConfig> = {
        PORT: 4000,
        NETWORK: "testnet",
        SUPABASE_URL: "https://test.supabase.co",
        SUPABASE_ANON_KEY: "test-key",
        NODE_ENV: "test",
        INGESTION_ENABLED: true,
        // Missing RustAcademy_CONTRACT_ID — should fail validation
      };

      const result = envSchema.validate(invalidIngestionConfig, {
        allowUnknown: true,
        abortEarly: false,
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("RustAcademy_CONTRACT_ID");
    });
  });
});
