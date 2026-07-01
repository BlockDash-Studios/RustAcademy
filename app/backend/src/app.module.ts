import {
  Module,
  MiddlewareConsumer,
  NestModule,
} from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ThrottlerModule } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";

import { AppConfigModule, envSchema, EnvConfig } from "./config";
import { AssetMetadataModule } from "./asset-metadata/asset-metadata.module";
import { HealthModule } from "./health/health.module";
import { StellarModule } from "./stellar/stellar.module";
import { SupabaseModule } from "./supabase/supabase.module";
import { UsernamesModule } from "./usernames/usernames.module";
import { MetricsModule } from "./metrics/metrics.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { LinksModule } from "./links/links.module";
import { ScamAlertsModule } from "./scam-alerts/scam-alerts.module";
import { TransactionsModule } from "./transactions/transactions.module";
import { PaymentsModule } from "./payments/payments.module";
import { MetricsMiddleware } from "./metrics/metrics.middleware";
import { MetricsInterceptor } from "./metrics/metrics.interceptor";
import { CorrelationIdMiddleware } from "./common/middleware/correlation-id.middleware";
import { OrganizationContextMiddleware } from "./common/middleware/organization-context.middleware";
import { ShadowTrafficMiddleware } from "./environment-parity/shadow-traffic.middleware";
import { IngestionModule } from "./ingestion/ingestion.module";
import { ApiKeysModule } from "./api-keys/api-keys.module";
import { MarketplaceModule } from "./marketplace/marketplace.module";
import { SentryModule } from "./sentry";
import { FiatRampsModule } from "./fiat-ramps/fiat-ramps.module";
import { RefundsModule } from "./refunds/refunds.module";
import { ExportsModule } from "./exports/exports.module";
import { JobQueueModule } from "./job-queue/job-queue.module";
import { AuditModule } from "./audit/audit.module";
import { FeatureFlagsModule } from "./feature-flags/feature-flags.module";
import { PrivacyModule } from "./privacy/privacy.module";
import { ContractsModule } from "./contracts/contracts.module";
import { SorobanToolingModule } from "./soroban-tooling/soroban-tooling.module";
import { CustomThrottlerGuard } from "./auth/guards/custom-throttler.guard";
import { OrganizationRoleGuard } from "./auth/guards/organization-role.guard";
import { throttlerModuleProfiles } from "./config/rate-limit.config";
import { EnvironmentParityModule } from "./environment-parity/environment-parity.module";
import { IndexerLagModule } from "./indexer-lag";
import { SupportBundleModule } from "./support-bundle/support-bundle.module";
import { getDynamicModules } from "./module-factory";
import { ChatModule } from "./chat/chat.module";

// Validate environment variables for module composition.
// This ensures that feature flags are deterministic and typed.
const validatedEnv = envSchema.validate(process.env, {
  allowUnknown: true,
  abortEarly: false,
}).value as EnvConfig;

@Module({
  imports: [
    SentryModule,
    AppConfigModule,
    // ScheduleModule registered once here — shared by NotificationsModule and ReconciliationModule
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: ".",
    }),
    ThrottlerModule.forRoot(throttlerModuleProfiles),
    SupabaseModule,
    HealthModule,
    AssetMetadataModule,
    StellarModule,
    UsernamesModule,
    MetricsModule,
    AnalyticsModule,
    LinksModule,
    ScamAlertsModule,
    TransactionsModule,
    PaymentsModule,
    IngestionModule,
    ApiKeysModule,
    MarketplaceModule,
    FiatRampsModule,
    RefundsModule,
    ExportsModule,
    JobQueueModule,
    AuditModule,
    ContractsModule,
    FeatureFlagsModule,
    PrivacyModule,
    SorobanToolingModule,
    EnvironmentParityModule,
    IndexerLagModule,
    SupportBundleModule,
    ChatModule,
    ...getDynamicModules(validatedEnv),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: OrganizationRoleGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        MetricsMiddleware,
        CorrelationIdMiddleware,
        OrganizationContextMiddleware,
        ShadowTrafficMiddleware,
      )
      .forRoutes("*");
  }
}
