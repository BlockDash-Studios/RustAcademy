import { Module } from '@nestjs/common';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';
import { StreakController } from './streak.controller';
import { StreakService } from './streak.service';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';

/**
 * RewardsModule
 *
 * Self-contained feature module for the XP/level/progression system.
 * Import this module in AppModule to enable the /rewards/* endpoints.
 *
 * Includes the referral-based XLM bonus placeholder under
 * /rewards/referrals/* (ReferralController + ReferralService).
 */
@Module({
  controllers: [RewardsController, StreakController, ReferralController],
  providers: [RewardsService, StreakService, ReferralService],
  exports: [RewardsService, StreakService, ReferralService],
})
export class RewardsModule {}
