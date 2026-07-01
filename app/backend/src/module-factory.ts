import { Type, DynamicModule, ForwardReference } from "@nestjs/common";
import { EnvConfig } from "./config/env.schema";
import { ReconciliationModule } from "./reconciliation/reconciliation.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { DeveloperModule } from "./developer/developer.module";

export type AppImport =
  | Type<unknown>
  | DynamicModule
  | Promise<DynamicModule>
  | ForwardReference<unknown>;

/**
 * Returns the list of dynamic modules to be loaded based on the application configuration.
 * This factory ensures that module loading is deterministic and based on typed config.
 *
 * @param config The application configuration object (validated EnvConfig)
 * @returns An array of modules to be imported
 */
export function getDynamicModules(config: EnvConfig): AppImport[] {
  const dynamicModules: AppImport[] = [];

  // Fail-fast check for production: DeveloperModule must not be enabled
  if (config.NODE_ENV === "production" && config.FEATURES_DEVELOPER_ROUTES_ENABLED) {
    throw new Error(
      "CONFIGURATION ERROR: Developer routes are enabled in production! " +
        "Ensure FEATURES_DEVELOPER_ROUTES_ENABLED is set to 'false' in production environments.",
    );
  }

  if (config.FEATURES_RECONCILIATION_ENABLED) {
    dynamicModules.push(ReconciliationModule as AppImport);
  }

  if (config.FEATURES_NOTIFICATIONS_ENABLED) {
    dynamicModules.push(NotificationsModule as AppImport);
  }

  if (config.FEATURES_DEVELOPER_ROUTES_ENABLED) {
    dynamicModules.push(DeveloperModule as AppImport);
  }

  return dynamicModules;
}
