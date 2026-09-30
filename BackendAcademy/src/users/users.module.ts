import { Module } from '@nestjs/common';
import { EscrowPayoutController } from './escrow-payout.controller';
import { EscrowPayoutService } from './escrow-payout.service';
import { TutorPayoutScheduleService } from './tutor-payout-schedule.service';

/**
 * Tutor identity, payout schedule (BE-082) and escrow payout (BE-050).
 *
 * EscrowPayoutService depends on TutorPayoutScheduleService so unlock times
 * are computed by the schedule owner rather than re-derived here.
 */
@Module({
  controllers: [EscrowPayoutController],
  providers: [EscrowPayoutService, TutorPayoutScheduleService],
  exports: [EscrowPayoutService, TutorPayoutScheduleService],
})
export class UsersModule {}
