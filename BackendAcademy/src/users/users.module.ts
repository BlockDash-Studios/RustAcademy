import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthModule } from '../auth/auth.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { SocialModule } from '../social/social.module';

@Module({
  imports: [AuthModule, OnboardingModule, AnalyticsModule, SocialModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
