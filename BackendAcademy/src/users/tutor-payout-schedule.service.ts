import { Injectable, BadRequestException } from '@nestjs/common';

/**
 * Configurable tutor payout schedule (BE-082).
 *
 * A tutor's payout schedule (weekly/monthly) determines when their accrued
 * earnings unlock for release via `escrow_payout`. Per this issue's
 * acceptance criteria, changing a tutor's schedule must only affect
 * accruals that happen *after* the change — earnings already accrued under
 * the old schedule keep their originally-computed unlock time.
 */

export type PayoutCadence = 'weekly' | 'monthly';

export interface TutorPayoutSchedule {
  tutorId: string;
  cadence: PayoutCadence;
  /** When this schedule took effect (ms since epoch). */
  effectiveFrom: number;
}

export interface AccrualUnlock {
  tutorId: string;
  /** When the earnings were accrued (ms since epoch). */
  accruedAt: number;
  /** When the accrual unlocks for escrow_payout release (ms since epoch). */
  unlocksAt: number;
  cadence: PayoutCadence;
}

const CADENCE_MS: Record<PayoutCadence, number> = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

@Injectable()
export class TutorPayoutScheduleService {
  /** History of schedule changes per tutor, oldest first. */
  private readonly schedules = new Map<string, TutorPayoutSchedule[]>();

  /** Current schedule for a tutor, defaulting to monthly if never configured. */
  getCurrentSchedule(tutorId: string): TutorPayoutSchedule {
    const history = this.schedules.get(tutorId);
    if (!history || history.length === 0) {
      return { tutorId, cadence: 'monthly', effectiveFrom: 0 };
    }
    return history[history.length - 1];
  }

  /**
   * Changes a tutor's payout cadence effective now. This does not alter the
   * unlock time of any earnings already accrued — only accruals recorded
   * after this call use the new cadence.
   */
  setSchedule(tutorId: string, cadence: PayoutCadence, now: number = Date.now()): TutorPayoutSchedule {
    if (cadence !== 'weekly' && cadence !== 'monthly') {
      throw new BadRequestException({
        error: `Unsupported payout cadence "${cadence}". Must be "weekly" or "monthly".`,
        code: 'INVALID_PAYOUT_CADENCE',
      });
    }

    const history = this.schedules.get(tutorId) ?? [];
    const schedule: TutorPayoutSchedule = { tutorId, cadence, effectiveFrom: now };
    history.push(schedule);
    this.schedules.set(tutorId, history);
    return schedule;
  }

  /**
   * Computes the unlock time for an earnings accrual, using whichever
   * schedule was in effect at `accruedAt` — never the tutor's *current*
   * schedule if it was changed after the fact. This is what keeps a
   * schedule change from retroactively shifting already-accrued earnings.
   */
  computeUnlock(tutorId: string, accruedAt: number = Date.now()): AccrualUnlock {
    const history = this.schedules.get(tutorId) ?? [];
    const scheduleAtAccrual =
      [...history].reverse().find((s) => s.effectiveFrom <= accruedAt) ??
      { tutorId, cadence: 'monthly' as PayoutCadence, effectiveFrom: 0 };

    return {
      tutorId,
      accruedAt,
      unlocksAt: accruedAt + CADENCE_MS[scheduleAtAccrual.cadence],
      cadence: scheduleAtAccrual.cadence,
    };
  }
}
