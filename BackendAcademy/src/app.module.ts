import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { GamificationModule } from './gamification/gamification.module';
import { ChatModule } from './chat/chat.module';
import { SocialModule } from './social/social.module';
import { StellarModule } from './stellar/stellar.module';
import { SandboxModule } from './sandbox/sandbox.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: Number(process.env.THROTTLE_TTL_MS ?? 60000),
        limit: Number(process.env.THROTTLE_LIMIT ?? 100),
      },
    ]),
    GamificationModule,
    ChatModule,
    SocialModule,
    StellarModule,
    SandboxModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
