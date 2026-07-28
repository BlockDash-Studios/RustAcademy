import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { ApiInfoController } from './api-info.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ChallengesModule } from './challenges/challenges.module';
import { RewardsModule } from './rewards/rewards.module';
import { SecurityModule } from './security/security.module';
import { SubmissionModule } from './submissions/submission.module';
import { TutorProfileModule } from './users/tutor-profile.module';
import { ContractsModule } from './contracts/contracts.module';
import { UserProfileModule } from './users/user-profile.module';
import { AiModule } from './ai/ai.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { WalletModule } from './wallet/wallet.module';
import { SocialModule } from './social/social.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { LessonModule } from './lessons/lesson.module';
import { TaskModule } from './tasks/task.module';
import { CourseModule } from './courses';
import { LoggingModule } from './logging/logging.module';
import { ProgressModule } from './courses/progress/progress.module';
import { AppConfigModule } from './config/config.module';
import { AssetsModule } from './assets/assets.module';
import { PathfindingModule } from './pathfinding/pathfinding.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { SearchModule } from './search/search.module';
import { PaymentsModule } from './payments/payments.module';
import { I18nModule } from './i18n/i18n.module';
import { DatabaseModule } from './database/database.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      // Values come from the validated env schema so local and container
      // deployments always agree on types and defaults.
      useFactory: (config: ConfigService) => [
        {
          limit: config.get<number>('THROTTLE_LIMIT', 10),
          ttl: config.get<number>('THROTTLE_TTL_MS', 60_000),
        },
      ],
    }),
    AuthModule,
    ContractsModule,
    UserProfileModule,
    TutorProfileModule,
    SubmissionModule,
    RewardsModule,
    SecurityModule,
    ChallengesModule,
    AiModule,
    LeaderboardModule,
    AnalyticsModule,
    WalletModule,
    SocialModule,
    OnboardingModule,
    LessonModule,
    TaskModule,
    CourseModule,
    AssetsModule,
    LoggingModule,
    PathfindingModule,
    MonitoringModule,
    ProgressModule,
    SearchModule,
    PaymentsModule,
    I18nModule,
    NotificationsModule,
  ],
  controllers: [AppController, ApiInfoController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
export class AppModule {}
