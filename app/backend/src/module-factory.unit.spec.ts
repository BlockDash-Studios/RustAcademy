import { EnvironmentModuleLoader, getDynamicModules } from "./module-factory";
import { EnvConfig } from "./config/env.schema";
import { ReconciliationModule } from "./reconciliation/reconciliation.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { DeveloperModule } from "./developer/developer.module";
import { IngestionBootstrapService } from "./ingestion/ingestion-bootstrap.service";

const baseConfig: Partial<EnvConfig> = {
  NODE_ENV: "development",
  FEATURES_RECONCILIATION_ENABLED: false,
  FEATURES_NOTIFICATIONS_ENABLED: false,
  FEATURES_DEVELOPER_ROUTES_ENABLED: false,
  INGESTION_ENABLED: false,
};

describe("EnvironmentModuleLoader", () => {
  describe("getModules()", () => {
    it("returns an empty array when all feature modules are disabled", () => {
      const loader = new EnvironmentModuleLoader(baseConfig as EnvConfig);
      expect(loader.getModules()).toEqual([]);
    });

    it("includes ReconciliationModule when FEATURES_RECONCILIATION_ENABLED is true", () => {
      const loader = new EnvironmentModuleLoader({
        ...baseConfig,
        FEATURES_RECONCILIATION_ENABLED: true,
      } as EnvConfig);
      const modules = loader.getModules();
      expect(modules).toContain(ReconciliationModule);
      expect(modules).not.toContain(NotificationsModule);
      expect(modules).not.toContain(DeveloperModule);
    });

    it("includes NotificationsModule when FEATURES_NOTIFICATIONS_ENABLED is true", () => {
      const loader = new EnvironmentModuleLoader({
        ...baseConfig,
        FEATURES_NOTIFICATIONS_ENABLED: true,
      } as EnvConfig);
      const modules = loader.getModules();
      expect(modules).toContain(NotificationsModule);
      expect(modules).not.toContain(ReconciliationModule);
      expect(modules).not.toContain(DeveloperModule);
    });

    it("includes DeveloperModule when FEATURES_DEVELOPER_ROUTES_ENABLED is true in non-production", () => {
      const loader = new EnvironmentModuleLoader({
        ...baseConfig,
        FEATURES_DEVELOPER_ROUTES_ENABLED: true,
      } as EnvConfig);
      expect(loader.getModules()).toContain(DeveloperModule);
    });

    it("includes all three modules when all feature flags are enabled in non-production", () => {
      const loader = new EnvironmentModuleLoader({
        ...baseConfig,
        FEATURES_RECONCILIATION_ENABLED: true,
        FEATURES_NOTIFICATIONS_ENABLED: true,
        FEATURES_DEVELOPER_ROUTES_ENABLED: true,
      } as EnvConfig);
      const modules = loader.getModules();
      expect(modules).toContain(ReconciliationModule);
      expect(modules).toContain(NotificationsModule);
      expect(modules).toContain(DeveloperModule);
    });

    it("includes ReconciliationModule and NotificationsModule but not DeveloperModule when both are enabled", () => {
      const loader = new EnvironmentModuleLoader({
        ...baseConfig,
        FEATURES_RECONCILIATION_ENABLED: true,
        FEATURES_NOTIFICATIONS_ENABLED: true,
      } as EnvConfig);
      const modules = loader.getModules();
      expect(modules).toContain(ReconciliationModule);
      expect(modules).toContain(NotificationsModule);
      expect(modules).not.toContain(DeveloperModule);
    });
  });

  describe("getProviders()", () => {
    it("returns an empty array when INGESTION_ENABLED is false", () => {
      const loader = new EnvironmentModuleLoader(baseConfig as EnvConfig);
      expect(loader.getProviders()).toEqual([]);
    });

    it("includes IngestionBootstrapService when INGESTION_ENABLED is true", () => {
      const loader = new EnvironmentModuleLoader({
        ...baseConfig,
        INGESTION_ENABLED: true,
      } as EnvConfig);
      expect(loader.getProviders()).toContain(IngestionBootstrapService);
    });

    it("returns only IngestionBootstrapService as the sole conditional provider", () => {
      const loader = new EnvironmentModuleLoader({
        ...baseConfig,
        INGESTION_ENABLED: true,
      } as EnvConfig);
      expect(loader.getProviders()).toHaveLength(1);
    });
  });

  describe("getConfig()", () => {
    it("returns the same config object passed to the constructor", () => {
      const config = { ...baseConfig } as EnvConfig;
      const loader = new EnvironmentModuleLoader(config);
      expect(loader.getConfig()).toBe(config);
    });
  });

  describe("constructor validation", () => {
    it("throws when DeveloperModule is enabled in production", () => {
      expect(
        () =>
          new EnvironmentModuleLoader({
            ...baseConfig,
            NODE_ENV: "production",
            FEATURES_DEVELOPER_ROUTES_ENABLED: true,
          } as EnvConfig),
      ).toThrow(/Developer routes are enabled in production/);
    });

    it("does not throw when DeveloperModule is disabled in production", () => {
      expect(
        () =>
          new EnvironmentModuleLoader({
            ...baseConfig,
            NODE_ENV: "production",
            FEATURES_DEVELOPER_ROUTES_ENABLED: false,
          } as EnvConfig),
      ).not.toThrow();
    });

    it("does not throw when DeveloperModule is enabled in test environment", () => {
      expect(
        () =>
          new EnvironmentModuleLoader({
            ...baseConfig,
            NODE_ENV: "test",
            FEATURES_DEVELOPER_ROUTES_ENABLED: true,
          } as EnvConfig),
      ).not.toThrow();
    });
  });
});

describe("getDynamicModules (deprecated shim)", () => {
  it("returns an empty array when all optional modules are disabled", () => {
    expect(getDynamicModules(baseConfig as EnvConfig)).toEqual([]);
  });

  it("includes ReconciliationModule when enabled", () => {
    const modules = getDynamicModules({
      ...baseConfig,
      FEATURES_RECONCILIATION_ENABLED: true,
    } as EnvConfig);
    expect(modules).toContain(ReconciliationModule);
    expect(modules).not.toContain(NotificationsModule);
    expect(modules).not.toContain(DeveloperModule);
  });

  it("includes NotificationsModule when enabled", () => {
    const modules = getDynamicModules({
      ...baseConfig,
      FEATURES_NOTIFICATIONS_ENABLED: true,
    } as EnvConfig);
    expect(modules).toContain(NotificationsModule);
    expect(modules).not.toContain(ReconciliationModule);
    expect(modules).not.toContain(DeveloperModule);
  });

  it("includes DeveloperModule when enabled in non-production", () => {
    const modules = getDynamicModules({
      ...baseConfig,
      FEATURES_DEVELOPER_ROUTES_ENABLED: true,
    } as EnvConfig);
    expect(modules).toContain(DeveloperModule);
  });

  it("throws an error if DeveloperModule is enabled in production", () => {
    expect(() =>
      getDynamicModules({
        ...baseConfig,
        NODE_ENV: "production",
        FEATURES_DEVELOPER_ROUTES_ENABLED: true,
      } as EnvConfig),
    ).toThrow(/Developer routes are enabled in production/);
  });

  it("includes multiple modules when multiple flags are enabled", () => {
    const modules = getDynamicModules({
      ...baseConfig,
      FEATURES_RECONCILIATION_ENABLED: true,
      FEATURES_NOTIFICATIONS_ENABLED: true,
    } as EnvConfig);
    expect(modules).toContain(ReconciliationModule);
    expect(modules).toContain(NotificationsModule);
    expect(modules).not.toContain(DeveloperModule);
  });
});
