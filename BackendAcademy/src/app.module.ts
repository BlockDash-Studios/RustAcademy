import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ChallengesModule } from './challenges/challenges.module';
import { RewardsModule } from './rewards/rewards.module';
import { SecurityModule } from './security/security.module';
import { SubmissionModule } from './submissions/submission.module';
import { TutorProfileModule } from './users/tutor-profile.module';
import { UserProfileModule } from './users/user-profile.module';
import { AiModule } from './ai/ai.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SocialModule } from './social/social.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { LessonModule } from './lessons/lesson.module';
import { TaskModule } from './tasks/task.module';
import { ProgressModule } from './courses/progress/progress.module';
import { AppConfigModule } from './config/config.module';
import { ContractsModule } from './contracts/contracts.module';
import { SearchModule } from './search/search.module';
import { PaymentsModule } from './payments/payments.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        limit: 10,
        ttl: 60_000,
      },
    ]),
    AppConfigModule,
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
    SocialModule,
    OnboardingModule,
    LessonModule,
    TaskModule,
    ProgressModule,
    SearchModule,
    PaymentsModule,
    SessionsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
