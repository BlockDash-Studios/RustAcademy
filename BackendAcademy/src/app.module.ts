import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { GamificationModule } from './gamification/gamification.module';
import { GradingModule } from './grading/grading.module';
import { ChatModule } from './chat/chat.module';
import { SocialModule } from './social/social.module';
import { StellarModule } from './stellar/stellar.module';
import { SandboxModule } from './sandbox/sandbox.module';
import { ProgressModule } from './progress/progress.module';

// Root application module: wires together global configuration/guards,
// every feature module, and the top-level controllers/providers.
@Module({
  imports: [
    // Loads environment variables and makes ConfigService available
    // app-wide (isGlobal: true) without needing to re-import
    // ConfigModule in every feature module.
    ConfigModule.forRoot({ isGlobal: true }),
    // Configures global rate limiting: by default, 100 requests per
    // 60-second window per client, both overridable via env vars.
    // Combined with APP_GUARD below, this applies to every route unless
    // a controller/route opts out or overrides it (e.g. via @Throttle
    // or @SkipThrottle).
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: Number(process.env.THROTTLE_TTL_MS ?? 60000),
        limit: Number(process.env.THROTTLE_LIMIT ?? 100),
      },
    ]),
    // Feature modules, each encapsulating its own controllers/providers
    // for a specific domain of the app.
    GamificationModule,
    GradingModule,
    ChatModule,
    SocialModule,
    StellarModule,
    SandboxModule,
    ProgressModule,
  ],
  // Top-level controllers not owned by a specific feature module:
  // AppController (root/basic routes) and HealthController
  // (liveness/readiness/status endpoints).
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    // Registers ThrottlerGuard as a global guard (via the APP_GUARD
    // token), so the rate limiting configured above is actually
    // enforced on every request rather than just being available.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}