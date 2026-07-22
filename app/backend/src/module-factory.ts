import { Type, DynamicModule, ForwardReference, Provider } from "@nestjs/common";
import { EnvConfig } from "./config/env.schema";
import { ReconciliationModule } from "./reconciliation/reconciliation.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { DeveloperModule } from "./developer/developer.module";
import { IngestionBootstrapService } from "./ingestion/ingestion-bootstrap.service";

export type AppImport =
  | Type<unknown>
  | DynamicModule
  | Promise<DynamicModule>
  | ForwardReference<unknown>;

/**
 * Typed loader for environment-driven dynamic module composition.
 * Encapsulates runtime behavior for conditional module and provider loading.
 */
export class EnvironmentModuleLoader {
  constructor(private readonly config: EnvConfig) {
    this.validateConfiguration();
  }

  /**
   * Validates the configuration for critical safety checks.
   * Throws an error if invalid configuration is detected.
   */
  private validateConfiguration(): void {
    // Fail-fast check for production: DeveloperModule must not be enabled
    if (this.config.NODE_ENV === "production" && this.config.FEATURES_DEVELOPER_ROUTES_ENABLED) {
      throw new Error(
        "CONFIGURATION ERROR: Developer routes are enabled in production! " +
          "Ensure FEATURES_DEVELOPER_ROUTES_ENABLED is set to 'false' in production environments.",
      );
    }
  }

  /**
   * Returns the list of dynamic modules to be loaded based on the application configuration.
   * This ensures that module loading is deterministic and based on typed config.
   *
   * @returns An array of modules to be imported
   */
  getModules(): AppImport[] {
    const dynamicModules: AppImport[] = [];

    if (this.config.FEATURES_RECONCILIATION_ENABLED) {
      dynamicModules.push(ReconciliationModule as AppImport);
    }

    if (this.config.FEATURES_NOTIFICATIONS_ENABLED) {
      dynamicModules.push(NotificationsModule as AppImport);
    }

    if (this.config.FEATURES_DEVELOPER_ROUTES_ENABLED) {
      dynamicModules.push(DeveloperModule as AppImport);
    }

    return dynamicModules;
  }

  /**
   * Returns environment-driven providers based on feature flags.
   * Encapsulates conditional provider registration logic.
   *
   * @returns An array of providers to be registered
   */
  getProviders(): Provider[] {
    const providers: Provider[] = [];

    if (this.config.INGESTION_ENABLED) {
      providers.push(IngestionBootstrapService);
    }

    return providers;
  }

  /**
   * Gets the validated environment configuration.
   * Useful for debugging and inspection.
   */
  getConfig(): EnvConfig {
    return this.config;
  }
}

/**
 * Returns the list of dynamic modules to be loaded based on the application configuration.
 * This factory ensures that module loading is deterministic and based on typed config.
 *
 * @deprecated Use EnvironmentModuleLoader class instead for better encapsulation
 * @param config The application configuration object (validated EnvConfig)
 * @returns An array of modules to be imported
 */
export function getDynamicModules(config: EnvConfig): AppImport[] {
  const loader = new EnvironmentModuleLoader(config);
  return loader.getModules();
}
