import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ReferralService } from './referral.service';
import type {
  ReferralRecord,
  ReferralSummaryResponse,
  CreateReferralRequest,
  QualifyReferralRequest,
  PayReferralRequest,
  ReferralUpdateResponse,
} from './interfaces/referral.interfaces';

/**
 * ReferralController
 *
 * Placeholder REST interface for the referral-based XLM bonus system.
 * All routes are prefixed with /rewards/referrals.
 *
 * Routes:
 *   POST /rewards/referrals                          – register a new referral
 *   GET  /rewards/referrals/:userId                  – referrer's full summary
 *   GET  /rewards/referrals/record/:referralId       – single referral record
 *   POST /rewards/referrals/:referralId/qualify      – mark referee as qualified
 *   POST /rewards/referrals/:referralId/pay          – mark bonus as paid
 */
@Controller('rewards/referrals')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  /**
   * Registers a new referral when a user signs up via an invite link.
   *
   * @example
   *   POST /rewards/referrals
   *   { "referrerId": "user-abc", "refereeId": "user-xyz" }
   *   → 201 Created with the new ReferralRecord
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createReferral(@Body() body: CreateReferralRequest): ReferralRecord {
    return this.referralService.createReferral(
      body.referrerId,
      body.refereeId,
      body.bonusAmount,
    );
  }

  /**
   * Returns a referrer's aggregated referral stats and full history.
   *
   * @example
   *   GET /rewards/referrals/user-abc
   *   → { referrerId, totalReferrals, paidReferrals, totalXlmEarned, … }
   */
  @Get(':userId')
  @HttpCode(HttpStatus.OK)
  getReferralSummary(
    @Param('userId') userId: string,
  ): ReferralSummaryResponse {
    return this.referralService.getReferralSummary(userId);
  }

  /**
   * Returns a single referral record by its unique ID.
   *
   * @example
   *   GET /rewards/referrals/record/ref_1234_abcde
   *   → { id, referrerId, refereeId, status, bonusAmount, … }
   */
  @Get('record/:referralId')
  @HttpCode(HttpStatus.OK)
  getReferral(@Param('referralId') referralId: string): ReferralRecord {
    return this.referralService.getReferral(referralId);
  }

  /**
   * Transitions a referral from 'pending' → 'qualified'.
   * Called by internal services when the referee completes their first
   * qualifying action (e.g. first graded task, first completed course).
   *
   * @example
   *   POST /rewards/referrals/ref_1234_abcde/qualify
   *   → { referralId, newStatus: "qualified", bonusAmount: 5, … }
   */
  @Post(':referralId/qualify')
  @HttpCode(HttpStatus.OK)
  qualifyReferral(
    @Param('referralId') referralId: string,
    @Body() body: QualifyReferralRequest,
  ): ReferralUpdateResponse {
    const qualifiedAt = body.qualifiedAt
      ? new Date(body.qualifiedAt)
      : undefined;
    return this.referralService.qualifyReferral(referralId, qualifiedAt);
  }

  /**
   * Transitions a referral from 'qualified' → 'paid'.
   * Called by the payout service after the on-chain XLM transfer is confirmed.
   *
   * @example
   *   POST /rewards/referrals/ref_1234_abcde/pay
   *   → { referralId, newStatus: "paid", bonusAmount: 5, paidAt: "…", … }
   */
  @Post(':referralId/pay')
  @HttpCode(HttpStatus.OK)
  payReferral(
    @Param('referralId') referralId: string,
    @Body() body: PayReferralRequest,
  ): ReferralUpdateResponse {
    const paidAt = body.paidAt ? new Date(body.paidAt) : undefined;
    return this.referralService.payReferral(referralId, paidAt);
  }
}
