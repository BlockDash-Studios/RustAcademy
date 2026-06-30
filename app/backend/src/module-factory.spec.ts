import { getDynamicModules } from "./module-factory";
import { EnvConfig } from "./config/env.schema";
import { ReconciliationModule } from "./reconciliation/reconciliation.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { DeveloperModule } from "./developer/developer.module";

describe("getDynamicModules", () => {
  const baseConfig: Partial<EnvConfig> = {
    NODE_ENV: "development",
    FEATURES_RECONCILIATION_ENABLED: false,
    FEATURES_NOTIFICATIONS_ENABLED: false,
    FEATURES_DEVELOPER_ROUTES_ENABLED: false,
  };

  it("should return an empty array when all optional modules are disabled", () => {
    const modules = getDynamicModules(baseConfig as EnvConfig);
    expect(modules).toEqual([]);
  });

  it("should include ReconciliationModule when enabled", () => {
    const config = {
      ...baseConfig,
      FEATURES_RECONCILIATION_ENABLED: true,
    };
    const modules = getDynamicModules(config as EnvConfig);
    expect(modules).toContain(ReconciliationModule);
    expect(modules).not.toContain(NotificationsModule);
    expect(modules).not.toContain(DeveloperModule);
  });

  it("should include NotificationsModule when enabled", () => {
    const config = {
      ...baseConfig,
      FEATURES_NOTIFICATIONS_ENABLED: true,
    };
    const modules = getDynamicModules(config as EnvConfig);
    expect(modules).toContain(NotificationsModule);
    expect(modules).not.toContain(ReconciliationModule);
    expect(modules).not.toContain(DeveloperModule);
  });

  it("should include DeveloperModule when enabled in non-production", () => {
    const config = {
      ...baseConfig,
      FEATURES_DEVELOPER_ROUTES_ENABLED: true,
    };
    const modules = getDynamicModules(config as EnvConfig);
    expect(modules).toContain(DeveloperModule);
  });

  it("should throw an error if DeveloperModule is enabled in production", () => {
    const config = {
      ...baseConfig,
      NODE_ENV: "production",
      FEATURES_DEVELOPER_ROUTES_ENABLED: true,
    };
    expect(() => getDynamicModules(config as EnvConfig)).toThrow(
      /Developer routes are enabled in production/,
    );
  });

  it("should include multiple modules when multiple are enabled", () => {
    const config = {
      ...baseConfig,
      FEATURES_RECONCILIATION_ENABLED: true,
      FEATURES_NOTIFICATIONS_ENABLED: true,
    };
    const modules = getDynamicModules(config as EnvConfig);
    expect(modules).toContain(ReconciliationModule);
    expect(modules).toContain(NotificationsModule);
    expect(modules).not.toContain(DeveloperModule);
  });
});
