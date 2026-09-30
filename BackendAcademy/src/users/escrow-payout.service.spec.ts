import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EscrowPayoutService } from './escrow-payout.service';
import { TutorPayoutScheduleService } from './tutor-payout-schedule.service';

/**
 * BE-050 acceptance criteria:
 *
 * - "Withdrawal before unlock is rejected" — withdraw() before the schedule's
 *   unlock time throws ESCROW_LOCKED, even though balance still reports the
 *   funds as held.
 * - "Unlock job releases on schedule" — releaseUnlocked() at/after the unlock
 *   time flips the entries to released, after which withdrawal succeeds.
 *
 * Unlock times are computed with fixed offsets from the accrual time, so the
 * tests never wait on real time; every timestamp is injected.
 */
describe('EscrowPayoutService', () => {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

  const T0 = 1_760_000_000_000; // fixed "accrual" moment
  const DAY = 24 * 60 * 60 * 1000;

  let service: EscrowPayoutService;
  let scheduleService: TutorPayoutScheduleService;

  beforeEach(() => {
    scheduleService = new TutorPayoutScheduleService();
    service = new EscrowPayoutService(scheduleService);
  });

  describe('accrue', () => {
    it('creates a locked entry with the unlock time from the default (monthly) schedule', () => {
      const entry = service.accrue('tutor-1', {
        accrualId: 'a-1',
        amountStroops: 1_000_000n,
        accruedAt: T0,
      });

      expect(entry.state).toBe('locked');
      expect(entry.amountStroops).toBe(1_000_000n);
      expect(entry.accruedAt).toBe(T0);
      expect(entry.unlocksAt).toBe(T0 + MONTH_MS);
    });

    it('honours a weekly schedule set before the accrual', () => {
      scheduleService.setSchedule('tutor-1', 'weekly', T0 - DAY);

      const entry = service.accrue('tutor-1', {
        accrualId: 'a-1',
        amountStroops: 500n,
        accruedAt: T0,
      });

      expect(entry.unlocksAt).toBe(T0 + WEEK_MS);
    });

    it('rejects duplicate accrual ids (idempotency) and non-positive amounts', () => {
      service.accrue('tutor-1', { accrualId: 'a-1', amountStroops: 100n, accruedAt: T0 });

      expect(() =>
        service.accrue('tutor-1', { accrualId: 'a-1', amountStroops: 100n, accruedAt: T0 }),
      ).toThrow(ConflictException);
      expect(() => service.accrue('tutor-1', { accrualId: 'a-2', amountStroops: 0n, accruedAt: T0 })).toThrow(
        BadRequestException,
      );
      expect(() => service.accrue('tutor-1', { accrualId: 'a-3', amountStroops: -5n, accruedAt: T0 })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('withdraw before unlock is rejected', () => {
    it('throws ESCROW_LOCKED with the earliest unlock while any entry is still locked', () => {
      service.accrue('tutor-1', { accrualId: 'a-1', amountStroops: 100n, accruedAt: T0 });
      service.accrue('tutor-1', { accrualId: 'a-2', amountStroops: 200n, accruedAt: T0 + DAY });

      const beforeUnlock = T0 + DAY + 1;

      expect(() => service.withdraw('tutor-1', beforeUnlock)).toThrow(BadRequestException);
      try {
        service.withdraw('tutor-1', beforeUnlock);
      } catch (error) {
        const response = (error as BadRequestException).getResponse() as {
          code?: string;
          earliestUnlockAt?: string;
        };
        expect(response.code).toBe('ESCROW_LOCKED');
        expect(response.earliestUnlockAt).toBe(new Date(T0 + MONTH_MS).toISOString());
      }

      // The funds stay held, not lost or paid out.
      expect(service.getBalance('tutor-1', beforeUnlock)).toEqual({
        lockedStroops: 300n,
        availableStroops: 0n,
      });
      expect(service.listWithdrawals('tutor-1')).toHaveLength(0);
    });

    it('throws NotFound when the tutor has no escrow entries at all', () => {
      expect(() => service.withdraw('ghost', T0)).toThrow(NotFoundException);
    });
  });

  describe('unlock job releases on schedule', () => {
    it('releases exactly the entries whose unlock time has arrived', () => {
      service.accrue('tutor-1', { accrualId: 'a-1', amountStroops: 100n, accruedAt: T0 });
      // Accrues 10 days later, so it unlocks 10 days after tutor-1's entry.
      service.accrue('tutor-2', { accrualId: 'a-2', amountStroops: 50n, accruedAt: T0 + 10 * DAY });

      // Just before tutor-1's unlock: nothing released anywhere.
      expect(service.releaseUnlocked(T0 + MONTH_MS - 1).map((e) => e.escrowId)).toEqual([]);

      // At the unlock time: tutor-1's entry is released, tutor-2's is not.
      const released = service.releaseUnlocked(T0 + MONTH_MS);
      expect(released.map((e) => e.escrowId)).toEqual(['a-1']);
      expect(released[0].state).toBe('unlocked');
      expect(released[0].releasedAt).toBe(T0 + MONTH_MS);

      // Running the job again before the next unlock is a no-op —
      // already-released entries stay put.
      expect(service.releaseUnlocked(T0 + 35 * DAY)).toEqual([]);
    });

    it('allows withdrawal once the unlock time arrives, and only of unlocked funds', () => {
      service.accrue('tutor-1', { accrualId: 'a-1', amountStroops: 100n, accruedAt: T0 });
      const later = service.accrue('tutor-1', {
        accrualId: 'a-2',
        amountStroops: 900n,
        accruedAt: T0 + DAY,
      });

      const atUnlock = T0 + MONTH_MS;
      const withdrawal = service.withdraw('tutor-1', atUnlock);

      expect(withdrawal.amountStroops).toBe(100n); // only a-1 was unlocked
      expect(withdrawal.entries).toEqual([{ escrowId: 'a-1', amountStroops: 100n }]);
      expect(later.state).toBe('locked');

      // After the second entry unlocks, the rest is withdrawable.
      service.releaseUnlocked(later.unlocksAt);
      const second = service.withdraw('tutor-1', later.unlocksAt);
      expect(second.amountStroops).toBe(900n);
      expect(service.getBalance('tutor-1', later.unlocksAt)).toEqual({
        lockedStroops: 0n,
        availableStroops: 0n,
      });
      expect(service.listWithdrawals('tutor-1')).toHaveLength(2);
    });
  });

  describe('getLockedEntries and balances', () => {
    it('classifies entries relative to `now`', () => {
      service.accrue('tutor-1', { accrualId: 'a-1', amountStroops: 100n, accruedAt: T0 });

      expect(service.getLockedEntries('tutor-1', T0)).toHaveLength(1);
      expect(service.getLockedEntries('tutor-1', T0 + MONTH_MS)).toHaveLength(0);
      expect(service.getBalance('tutor-1', T0)).toEqual({
        lockedStroops: 100n,
        availableStroops: 0n,
      });
      expect(service.getBalance('tutor-1', T0 + MONTH_MS)).toEqual({
        lockedStroops: 0n,
        availableStroops: 100n,
      });
    });
  });
});
