import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AppConfigModule } from './config';
import { HealthModul8e } from './health/health.module';
import { StellarModule } from './stellar/stellar.module';
import { SupabaseModule } from './supabase/supabase.module';
import { UsernamesModule } from './usernames/usernames.module';
import { MetricsModule } from './metrics/metrics.module';
import { MetricsMiddleware } from './metrics/metrics.middleware';
import { MetricsInterceptor } from './metrics/metrics.interceptor';

@Module({
  imports: [
    AppConfigModule,
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
    }),
    ThrottlerModule.forRoot({
      ttl: RATE_LIMITS.PUBLIC.ttl,
      limit: RATE_LIMITS.PUBLIC.limit,
    }),
    SupabaseModule,
    HealthModule,
    StellarModule,
    UsernamesModule,
    MetricsModule
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor, 
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(MetricsMiddleware)
      .forRoutes('*');
  }
}

