import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StreakService } from './streak.service';

describe('StreakService', () => {
  let service: StreakService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StreakService],
    }).compile();

    service = module.get<StreakService>(StreakService);
  });

  // Clear all data before each test
  beforeEach(() => {
    service.clearAll();
  });

  // -------------------------------------------------------------------------
  // getStreak() tests
  // -------------------------------------------------------------------------

  describe('getStreak()', () => {
    const USER = 'test-user-abc';

    it('returns zero streak for new user', () => {
      service.clearAll();
      const streak = service.getStreak(USER);
      expect(streak).toMatchObject({
        userId: USER,
        currentStreak: 0,
        longestStreak: 0,
        lastCheckin: null,
        nextCheckinAvailable: expect.any(String),
        isStreakAlive: false,
      });
    });
  });

  // -------------------------------------------------------------------------
  // checkIn() tests
  // -------------------------------------------------------------------------

  describe('checkIn()', () => {
    const USER = 'test-user-abc';

    it('allows first check-in', () => {
      const result = service.checkIn(USER);
      expect(result).toMatchObject({
        userId: USER,
        xpAwarded: 10, // BASE_CHECKIN_XP
        newStreak: 1,
        longestStreak: 1,
        streakBonus: 0,
      });
      expect(result.message).toContain('Welcome');
    });

    it('prevents double check-in same day', () => {
      service.checkIn(USER);
      expect(() => service.checkIn(USER)).toThrow(
        /already checked in today/,
      );
    });

    it('continues streak on consecutive days', () => {
      const now = new Date('2026-01-01T12:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(now);

      // Day 1
      service.checkIn(USER);
      
      // Day 2 (24 hours later)
      jest.setSystemTime(new Date('2026-01-02T12:00:00Z'));
      
      const result = service.checkIn(USER);
      expect(result.newStreak).toBe(2);
      expect(result.streakBonus).toBe(0);
      
      jest.useRealTimers();
    });

    it('resets streak after missing a day', () => {
      const day1 = new Date('2026-01-01T12:00:00Z');
      jest.useFakeTimers();
      jest.setSystemTime(day1);

      // Day 1
      service.checkIn(USER);
      
      // 2 days later (missed a day)
      jest.setSystemTime(new Date('2026-01-03T12:00:00Z'));
      
      const result = service.checkIn(USER);
      expect(result.newStreak).toBe(1); // Reset to 1
      expect(result.message).toContain('Streak reset');
      
      jest.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // resetStreak() tests
  // -------------------------------------------------------------------------

  describe('resetStreak()', () => {
    const USER = 'test-user-abc';

    it('resets user streak to zero', () => {
      // Build up a streak
      service.checkIn(USER);
      
      // Verify streak is active
      let streak = service.getStreak(USER);
      expect(streak.currentStreak).toBe(1);
      
      // Reset
      service.resetStreak(USER);
      
      // Verify reset
      streak = service.getStreak(USER);
      expect(streak.currentStreak).toBe(0);
      expect(streak.longestStreak).toBe(0);
      expect(streak.lastCheckin).toBeNull();
    });
  });
});