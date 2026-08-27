import { Module, MiddlewareConsumer, NestModule, ValidationPipe, Injectable, Inject } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR, APP_PIPE, Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModule,
} from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BadgesModule } from './badges/badges.module';
import { ChallengesModule } from './challenges/challenges.module';
import { ChatModule } from './chat/chat.module';
import { RewardsModule } from './rewards/rewards.module';
import { SecurityModule } from './security/security.module';
import { SubmissionModule } from './submissions/submission.module';
import { UsersModule } from './users/users.module';
import { TutorProfileModule } from './users/tutor-profile.module';
import { ContractsModule } from './contracts/contracts.module';
import { UserProfileModule } from './users/user-profile.module';
import { AppConfigModule } from './config/config.module';
import { AssetsModule } from './assets/assets.module';
import { DatabaseModule } from './database/database.module';
import { DlqModule } from './dead-letter-queue/dlq.module';
import { PathfindingModule } from './pathfinding/pathfinding.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { SearchModule } from './search/search.module';
import { PaymentsModule } from './payments/payments.module';
import { I18nModule } from './i18n/i18n.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthModule } from './health/health.module';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { ResponseInterceptor } from './common/response.interceptor';
import { AiModule } from './ai/ai.module';
import { JobsModule } from './jobs/jobs.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { WalletModule } from './wallet/wallet.module';
import { SocialModule } from './social/social.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { LessonModule } from './lessons/lesson.module';
import { TaskModule } from './tasks/task.module';
import { CourseModule } from './courses/course.module';
import { LoggingModule } from './logging/logging.module';
import { ProgressModule } from './courses/progress/progress.module';
import { RedisModule } from './redis/redis.module';
import { ReportsModule } from './reports/reports.module';
import { SessionsModule } from './sessions/sessions.module';
import { AuditModule } from './audit/audit.module';
import { HintsModule } from './hints/hint.module';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: any,
    @InjectThrottlerStorage() storageService: any,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }
}

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    DatabaseModule,
    RedisModule,
    AuthModule,
    ContractsModule,
    AdminModule,
    BadgesModule,
    ChatModule,
    UsersModule,
    AuditModule,
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
    ProgressModule,
    SessionsModule,
    ReportsModule,
    JobsModule,
    DlqModule,
    AssetsModule,
    LoggingModule,
    PathfindingModule,
    MonitoringModule,
    SearchModule,
    PaymentsModule,
    I18nModule,
    NotificationsModule,
    HealthModule,
    HintsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    Reflector,
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_PIPE, useValue: new ValidationPipe({ transform: true }) },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}