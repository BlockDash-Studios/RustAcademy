import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccrueEscrowDto, ReleaseUnlockedDto, WithdrawEscrowDto } from './dto/escrow-payout.dto';
import { EscrowPayoutService } from './escrow-payout.service';

/**
 * REST surface for the tutor escrow payout (BE-050).
 *
 * Base path: /api/v1/escrow
 *
 * Like the other controllers it stays thin: the service owns the locking
 * rules, and NestJS maps its exceptions to status codes:
 *
 *   ConflictException  (409) → accrual id replayed
 *   BadRequestException(400) → withdrawal before unlock (code ESCROW_LOCKED)
 *   NotFoundException  (404) → nothing to withdraw
 *
 * Stroop amounts are bigint internally and travel the wire as strings.
 */
@ApiTags('escrow')
@Controller('v1/escrow')
export class EscrowPayoutController {
  constructor(private readonly escrowPayout: EscrowPayoutService) {}

  @Post('accrue')
  @ApiOperation({ summary: 'Accrue a confirmed contribution into time-locked escrow' })
  accrue(@Body() dto: AccrueEscrowDto) {
    const entry = this.escrowPayout.accrue(dto.tutorId, {
      accrualId: dto.accrualId,
      amountStroops: BigInt(dto.amountStroops),
    });
    // bigint is not JSON-serialisable, so the wire form is a string.
    return { ...entry, amountStroops: entry.amountStroops.toString() };
  }

  @Post('withdraw')
  @HttpCode(200)
  @ApiOperation({ summary: 'Withdraw every unlocked escrow entry for a tutor' })
  withdraw(@Body() dto: WithdrawEscrowDto) {
    const withdrawal = this.escrowPayout.withdraw(dto.tutorId);
    return {
      ...withdrawal,
      amountStroops: withdrawal.amountStroops.toString(),
      entries: withdrawal.entries.map((entry) => ({
        ...entry,
        amountStroops: entry.amountStroops.toString(),
      })),
    };
  }

  @Post('release')
  @HttpCode(200)
  @ApiOperation({ summary: 'Run the unlock job: release every entry whose unlock time has arrived' })
  release(@Body() dto: ReleaseUnlockedDto) {
    const now = dto.now !== undefined ? Number(dto.now) : undefined;
    const released = this.escrowPayout.releaseUnlocked(
      now !== undefined && Number.isFinite(now) ? now : undefined,
    );
    return {
      releasedCount: released.length,
      released: released.map((entry) => ({
        ...entry,
        amountStroops: entry.amountStroops.toString(),
      })),
    };
  }

  @Get('tutors/:tutorId/entries')
  @ApiOperation({ summary: "List a tutor's escrow entries" })
  listEntries(@Param('tutorId') tutorId: string) {
    return {
      tutorId,
      entries: this.escrowPayout.listEntries(tutorId).map((entry) => ({
        ...entry,
        amountStroops: entry.amountStroops.toString(),
      })),
    };
  }

  @Get('tutors/:tutorId/balance')
  @ApiOperation({ summary: "Get a tutor's locked and available escrow balance" })
  getBalance(@Param('tutorId') tutorId: string) {
    const balance = this.escrowPayout.getBalance(tutorId);
    return {
      tutorId,
      lockedStroops: balance.lockedStroops.toString(),
      availableStroops: balance.availableStroops.toString(),
    };
  }

  @Get('tutors/:tutorId/withdrawals')
  @ApiOperation({ summary: "List a tutor's executed withdrawals" })
  listWithdrawals(@Param('tutorId') tutorId: string) {
    return {
      tutorId,
      withdrawals: this.escrowPayout.listWithdrawals(tutorId).map((withdrawal) => ({
        ...withdrawal,
        amountStroops: withdrawal.amountStroops.toString(),
        entries: withdrawal.entries.map((entry) => ({
          ...entry,
          amountStroops: entry.amountStroops.toString(),
        })),
      })),
    };
  }
}
