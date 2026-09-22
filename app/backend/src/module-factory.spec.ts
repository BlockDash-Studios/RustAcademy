import { getDynamicModules } from "./module-factory";
import { EnvConfig } from "./config/env.schema";
import { NotificationsModule } from "./notifications/notifications.module";

describe("getDynamicModules", () => {
  const baseConfig: Partial<EnvConfig> = {
    NODE_ENV: "development",
    FEATURES_NOTIFICATIONS_ENABLED: false,
  };

  it("should return an empty array when all optional modules are disabled", () => {
    const modules = getDynamicModules(baseConfig as EnvConfig);
    expect(modules).toEqual([]);
  });

  it("should include NotificationsModule when enabled", () => {
    const config = {
      ...baseConfig,
      FEATURES_NOTIFICATIONS_ENABLED: true,
    };
    const modules = getDynamicModules(config as EnvConfig);
    expect(modules).toContain(NotificationsModule);
  });
});
