import { Type, DynamicModule, ForwardReference } from "@nestjs/common";
import { EnvConfig } from "./config/env.schema";
import { NotificationsModule } from "./notifications/notifications.module";

export type AppImport =
  | Type<unknown>
  | DynamicModule
  | Promise<DynamicModule>
  | ForwardReference<unknown>;

/**
 * Typed loader that encapsulates dynamic module composition behind a
 * well-typed interface (Issue #336).
 *
 * AppModule should call `EnvironmentModuleLoader.getModules(config)` instead
 * of calling `getDynamicModules` directly, so the composition logic is in one
 * place and the env-config contract is explicit.
 */
export class EnvironmentModuleLoader {
  static getModules(config: EnvConfig): AppImport[] {
    return getDynamicModules(config);
  }
}

/**
 * Returns the list of dynamic modules to be loaded based on the application configuration.
 * This factory ensures that module loading is deterministic and based on typed config.
 *
 * @param config The application configuration object (validated EnvConfig)
 * @returns An array of modules to be imported
 */
export function getDynamicModules(config: EnvConfig): AppImport[] {
  const dynamicModules: AppImport[] = [];

  if (config.FEATURES_NOTIFICATIONS_ENABLED) {
    dynamicModules.push(NotificationsModule as AppImport);
  }

  return dynamicModules;
}
