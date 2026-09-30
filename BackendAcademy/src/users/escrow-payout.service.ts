import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TutorPayoutScheduleService } from './tutor-payout-schedule.service';

/**
 * Time-locked escrow for tutor earnings (BE-050).
 *
 * EscrowPayoutService accrues a tutor's confirmed contributions into
 * time-locked escrow entries, releases them once their unlock time arrives
 * (per the tutor's payout schedule from BE-082), and exposes the withdraw
 * endpoint's core operation: a withdrawal requested *before* the unlock time
 * is rejected, so earnings stay locked to the schedule.
 *
 * Entry lifecycle: `locked` (still time-locked) → `unlocked` (past its unlock
 * time, released by the unlock job or implicitly by a withdrawal) →
 * `withdrawn` (paid out). `unlock`-ing is idempotent bookkeeping; only a
 * withdrawal moves money.
 *
 * In-memory like the other services so a repository can be swapped in later
 * without changing callers. Amounts are held in stroops (1 XLM = 10^7
 * stroops), the indivisible unit, so no rounding is ever invented.
 */

export type EscrowState = 'locked' | 'unlocked' | 'withdrawn';

export interface EscrowEntry {
  escrowId: string;
  tutorId: string;
  /** Stroops held in this entry. */
  amountStroops: bigint;
  /** When the earnings were accrued (ms since epoch). */
  accruedAt: number;
  /** When this entry unlocks for withdrawal (ms since epoch). */
  unlocksAt: number;
  state: EscrowState;
  /** Set when the entry is released by the unlock job or a withdrawal. */
  releasedAt?: number;
  /** Transaction hash of the on-chain release, when one is recorded. */
  transactionHash?: string;
}

export interface WithdrawalResult {
  withdrawalId: string;
  tutorId: string;
  amountStroops: bigint;
  entries: Array<{ escrowId: string; amountStroops: bigint }>;
  withdrawnAt: number;
}

@Injectable()
export class EscrowPayoutService {
  /** tutorId → escrow entries, oldest accrual first. */
  private readonly escrow = new Map<string, EscrowEntry[]>();
  /** Withdrawals already executed, across all tutors. */
  private readonly withdrawals: WithdrawalResult[] = [];

  private nextWithdrawalId = 1;

  constructor(private readonly scheduleService: TutorPayoutScheduleService) {}

  /**
   * Accrues a confirmed contribution into escrow. The unlock time comes from
   * the tutor's payout schedule at `accruedAt`, so later schedule changes
   * never shift already-accrued earnings.
   */
  accrue(
    tutorId: string,
    input: { accrualId: string; amountStroops: bigint; accruedAt?: number },
  ): EscrowEntry {
    if (!tutorId) {
      throw new BadRequestException('tutorId is required');
    }
    if (!input.accrualId) {
      throw new BadRequestException('accrualId is required');
    }
    if (input.amountStroops <= 0n) {
      throw new BadRequestException('amountStroops must be greater than zero');
    }

    const entries = this.escrow.get(tutorId) ?? [];
    if (entries.some((entry) => entry.escrowId === input.accrualId)) {
      throw new ConflictException(
        `Escrow entry ${input.accrualId} already exists for tutor ${tutorId}`,
      );
    }

    const unlock = this.scheduleService.computeUnlock(tutorId, input.accruedAt ?? Date.now());
    const entry: EscrowEntry = {
      escrowId: input.accrualId,
      tutorId,
      amountStroops: input.amountStroops,
      accruedAt: unlock.accruedAt,
      unlocksAt: unlock.unlocksAt,
      state: 'locked',
    };

    entries.push(entry);
    this.escrow.set(tutorId, entries);
    return entry;
  }

  /** All escrow entries held for a tutor, oldest accrual first. */
  listEntries(tutorId: string): EscrowEntry[] {
    return [...(this.escrow.get(tutorId) ?? [])];
  }

  /** Entries still locked and not yet unlockable, as of `now`. */
  getLockedEntries(tutorId: string, now: number = Date.now()): EscrowEntry[] {
    return this.listEntries(tutorId).filter(
      (entry) => entry.state === 'locked' && entry.unlocksAt > now,
    );
  }

  /**
   * The unlock job: flips every entry past its unlock time to `unlocked`.
   *
   * Idempotent — already-unlocked entries are left alone. A withdrawal does
   * not depend on this having run: it pays anything past its unlock time.
   * Returns the entries this run unlocked.
   */
  releaseUnlocked(now: number = Date.now()): EscrowEntry[] {
    const released: EscrowEntry[] = [];
    for (const entries of this.escrow.values()) {
      for (const entry of entries) {
        if (entry.state === 'locked' && entry.unlocksAt <= now) {
          entry.state = 'unlocked';
          entry.releasedAt = now;
          released.push(entry);
        }
      }
    }
    return released;
  }

  /**
   * Withdraws every entry past its unlock time for a tutor.
   *
   * A withdrawal requested before any entry's unlock time is rejected with
   * `ESCROW_LOCKED`, naming the earliest unlock — that is the acceptance
   * criterion: the schedule, not the caller, decides when funds move.
   *
   * Payable = not yet withdrawn and past its unlock time, whether or not the
   * unlock job has explicitly run: time is the trigger, the job is just
   * bookkeeping.
   */
  withdraw(tutorId: string, now: number = Date.now()): WithdrawalResult {
    const entries = this.escrow.get(tutorId) ?? [];

    const stillLocked = entries.filter((entry) => entry.state === 'locked');
    const payable = entries.filter(
      (entry) => entry.state !== 'withdrawn' && entry.unlocksAt <= now,
    );

    if (payable.length === 0) {
      if (stillLocked.length > 0) {
        const earliestUnlockAt = Math.min(...stillLocked.map((entry) => entry.unlocksAt));
        const msRemaining = Math.max(0, earliestUnlockAt - now);
        throw new BadRequestException({
          error: `Escrow is time-locked: earliest unlock at ${new Date(earliestUnlockAt).toISOString()} (${msRemaining} ms remaining)`,
          code: 'ESCROW_LOCKED',
          earliestUnlockAt: new Date(earliestUnlockAt).toISOString(),
          msRemaining,
        });
      }
      throw new NotFoundException(`No withdrawable escrow entries for tutor ${tutorId}`);
    }

    // Mark exactly the entries being paid out, so the balance stays accurate
    // for later withdrawals.
    payable.forEach((entry) => {
      if (entry.state === 'locked') {
        // Implicitly run the unlock step for this entry.
        entry.releasedAt = now;
      }
      entry.state = 'withdrawn';
    });

    const withdrawal: WithdrawalResult = {
      withdrawalId: `wd-${this.nextWithdrawalId++}`,
      tutorId,
      amountStroops: payable.reduce((total, entry) => total + entry.amountStroops, 0n),
      entries: payable.map((entry) => ({
        escrowId: entry.escrowId,
        amountStroops: entry.amountStroops,
      })),
      withdrawnAt: now,
    };
    this.withdrawals.push(withdrawal);
    return withdrawal;
  }

  /** Splits a tutor's live (not withdrawn) balance into locked vs available. */
  getBalance(
    tutorId: string,
    now: number = Date.now(),
  ): { lockedStroops: bigint; availableStroops: bigint } {
    let lockedStroops = 0n;
    let availableStroops = 0n;
    for (const entry of this.listEntries(tutorId)) {
      if (entry.state === 'withdrawn') continue;
      if (entry.unlocksAt <= now) {
        availableStroops += entry.amountStroops;
      } else {
        lockedStroops += entry.amountStroops;
      }
    }
    return { lockedStroops, availableStroops };
  }

  /** Withdrawals already executed for a tutor, oldest first. */
  listWithdrawals(tutorId: string): WithdrawalResult[] {
    return this.withdrawals.filter((withdrawal) => withdrawal.tutorId === tutorId);
  }
}
