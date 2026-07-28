import { Test, TestingModule } from '@nestjs/testing';
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

  // Restore real timers after each test to prevent cross-test pollution
  afterEach(() => {
    jest.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // getStreak() tests
  // -------------------------------------------------------------------------

  describe('getStreak()', () => {
    const USER = 'test-user-abc';

    it('returns zero streak for new user who has never checked in', () => {
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
      // Day 1
      service.checkIn(USER);
      
      // Simulate next day by advancing system time +24h
      const now = Date.now();
      const tomorrow = now + 86400000;
      jest.useFakeTimers({ now: tomorrow });
      
      const result = service.checkIn(USER);
      expect(result.newStreak).toBe(2);
      // Bonus thresholds start at 3-day streak, so 2-day streak has 0 bonus
      expect(result.streakBonus).toBe(0);
      
      // Restore real timers
      jest.useRealTimers();
    });

    it('resets streak after missing a day', () => {
      // Day 1
      service.checkIn(USER);
      
      // Simulate 2 days later (missed a day) by advancing system time +48h
      const now = Date.now();
      const twoDaysLater = now + 2 * 86400000; // +48 hours
      jest.useFakeTimers({ now: twoDaysLater });
      
      const result = service.checkIn(USER);
      expect(result.newStreak).toBe(1); // Reset to 1
      expect(result.message).toContain('Streak reset');
      
      // Restore real timers
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