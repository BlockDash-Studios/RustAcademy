import {
  Module,
  MiddlewareConsumer,
  NestModule,
} from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ThrottlerModule } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";

import { AppConfigModule, validateEnv } from "./config";
import { AssetMetadataModule } from "./asset-metadata/asset-metadata.module";
import { HealthModule } from "./health/health.module";
import { StellarModule } from "./stellar/stellar.module";
import { SupabaseModule } from "./supabase/supabase.module";
import { UsernamesModule } from "./usernames/usernames.module";
import { MetricsModule } from "./metrics/metrics.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { TransactionsModule } from "./transactions/transactions.module";
import { PaymentsModule } from "./payments/payments.module";
import { MetricsMiddleware } from "./metrics/metrics.middleware";
import { MetricsInterceptor } from "./metrics/metrics.interceptor";
import { CorrelationIdMiddleware } from "./common/middleware/correlation-id.middleware";
import { CorrelationContextModule } from "./common/correlation/correlation-context.module";
import { OrganizationContextMiddleware } from "./common/middleware/organization-context.middleware";
import { ApiKeysModule } from "./api-keys/api-keys.module";
import { JobQueueModule } from "./job-queue/job-queue.module";
import { AuditModule } from "./audit/audit.module";
import { ContractsModule } from "./contracts/contracts.module";
import { SorobanToolingModule } from "./soroban-tooling/soroban-tooling.module";
import { CustomThrottlerGuard } from "./auth/guards/custom-throttler.guard";
import { OrganizationRoleGuard } from "./auth/guards/organization-role.guard";
import { throttlerModuleProfiles } from "./config/rate-limit.config";
import { getDynamicModules } from "./module-factory";
import { ChatModule } from "./chat/chat.module";

// Validate environment variables for module composition.
// This ensures that feature flags are deterministic and typed, and fails
// fast (before the application is created) when required configuration is
// missing or invalid.
const validatedEnv = validateEnv(process.env);

@Module({
  imports: [
    CorrelationContextModule,
    AppConfigModule,
    // ScheduleModule registered once here — shared by NotificationsModule
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
    TransactionsModule,
    PaymentsModule,
    ApiKeysModule,
    JobQueueModule,
    AuditModule,
    ContractsModule,
    SorobanToolingModule,
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
      )
      .forRoutes("*");
  }
}
