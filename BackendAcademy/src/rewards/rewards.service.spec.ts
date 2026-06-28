import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RewardsService } from './rewards.service';
import {
  MAX_LEVEL,
  levelForXp,
  xpThresholdForLevel,
  xpToNextLevel,
  PRIZE_POOL_DEFAULT_CURRENCY,
  PRIZE_DISTRIBUTION_PERCENTAGES,
  STREAK_MILESTONE_DAYS,
  STREAK_MILESTONE_XP,
  LEVEL_MILESTONE_INTERVAL,
  LEVEL_MILESTONE_XP,
} from './rewards.constants';

// ---------------------------------------------------------------------------
// Pure helper unit tests — no NestJS container needed
// ---------------------------------------------------------------------------

describe('rewards.constants helpers', () => {
  describe('xpThresholdForLevel', () => {
    it('level 1 starts at 0 XP', () => {
      expect(xpThresholdForLevel(1)).toBe(0);
    });

    it('level 2 requires 100 XP', () => {
      expect(xpThresholdForLevel(2)).toBe(100);
    });

    it('level 3 requires 400 XP', () => {
      expect(xpThresholdForLevel(3)).toBe(400);
    });

    it('level 10 requires 8100 XP', () => {
      expect(xpThresholdForLevel(10)).toBe(8100);
    });

    it('level 50 (MAX) returns a positive value', () => {
      expect(xpThresholdForLevel(MAX_LEVEL)).toBeGreaterThan(0);
    });
  });

  describe('levelForXp', () => {
    it('0 XP → level 1', () => {
      expect(levelForXp(0)).toBe(1);
    });

    it('99 XP → level 1 (threshold for L2 is 100)', () => {
      expect(levelForXp(99)).toBe(1);
    });

    it('100 XP → level 2', () => {
      expect(levelForXp(100)).toBe(2);
    });

    it('400 XP → level 3', () => {
      expect(levelForXp(400)).toBe(3);
    });

    it('large XP value caps at MAX_LEVEL', () => {
      expect(levelForXp(Number.MAX_SAFE_INTEGER)).toBe(MAX_LEVEL);
    });

    it('exactly at level 10 threshold → level 10', () => {
      expect(levelForXp(xpThresholdForLevel(10))).toBe(10);
    });

    it('one XP below level 10 threshold → level 9', () => {
      expect(levelForXp(xpThresholdForLevel(10) - 1)).toBe(9);
    });
  });

  describe('xpToNextLevel', () => {
    it('returns 0 at MAX_LEVEL', () => {
      expect(xpToNextLevel(xpThresholdForLevel(MAX_LEVEL), MAX_LEVEL)).toBe(0);
    });

    it('at level 1 with 0 XP → 100 XP to next', () => {
      expect(xpToNextLevel(0, 1)).toBe(100);
    });

    it('at level 2 with 100 XP → 300 XP to next (L3 = 400)', () => {
      expect(xpToNextLevel(100, 2)).toBe(300);
    });
  });
});

// ---------------------------------------------------------------------------
// RewardsService integration tests (with NestJS DI)
// ---------------------------------------------------------------------------

describe('RewardsService', () => {
  let service: RewardsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RewardsService],
    }).compile();

    service = module.get<RewardsService>(RewardsService);
  });

  // ---- getAllThresholds ----

  describe('getAllThresholds()', () => {
    it('returns exactly MAX_LEVEL entries', () => {
      const { thresholds } = service.getAllThresholds();
      expect(thresholds).toHaveLength(MAX_LEVEL);
    });

    it('first entry is level 1 with 0 XP required', () => {
      const { thresholds } = service.getAllThresholds();
      expect(thresholds[0]).toMatchObject({ level: 1, xpRequired: 0 });
    });

    it('last entry is level MAX_LEVEL', () => {
      const { thresholds } = service.getAllThresholds();
      expect(thresholds[MAX_LEVEL - 1].level).toBe(MAX_LEVEL);
    });

    it('thresholds are monotonically increasing', () => {
      const { thresholds } = service.getAllThresholds();
      for (let i = 1; i < thresholds.length; i++) {
        expect(thresholds[i].xpRequired).toBeGreaterThan(
          thresholds[i - 1].xpRequired,
        );
      }
    });

    it('each entry has a non-empty title string', () => {
      const { thresholds } = service.getAllThresholds();
      for (const t of thresholds) {
        expect(typeof t.title).toBe('string');
        expect(t.title.length).toBeGreaterThan(0);
      }
    });
  });

  // ---- getLevelThreshold ----

  describe('getLevelThreshold(level)', () => {
    it('returns correct data for level 1', () => {
      const result = service.getLevelThreshold(1);
      expect(result).toMatchObject({ level: 1, xpRequired: 0 });
    });

    it('returns correct data for level 10', () => {
      const result = service.getLevelThreshold(10);
      expect(result).toMatchObject({ level: 10, xpRequired: 8100 });
    });

    it('throws NotFoundException for level 0', () => {
      expect(() => service.getLevelThreshold(0)).toThrow(NotFoundException);
    });

    it('throws NotFoundException for level 51', () => {
      expect(() => service.getLevelThreshold(51)).toThrow(NotFoundException);
    });

    it('throws NotFoundException for negative level', () => {
      expect(() => service.getLevelThreshold(-5)).toThrow(NotFoundException);
    });
  });

  // ---- getUserProgression + addXp ----

  describe('getUserProgression(userId)', () => {
    const USER = 'test-user-abc';

    beforeEach(() => {
      // Seed user with 0 XP so the record exists
      service.resetXp(USER);
    });

    it('returns level 1 and correct fields at 0 XP', () => {
      const prog = service.getUserProgression(USER);
      expect(prog).toMatchObject({
        userId: USER,
        xp: 0,
        level: 1,
        xpToNextLevel: 100,
        currentLevelThreshold: 0,
        nextLevelThreshold: 100,
        streak: {
          currentStreak: 0,
          lastActivityDate: null,
        },
      });
    });

    it('advances to level 2 after exactly 100 XP', () => {
      service.addXp(USER, 100);
      const prog = service.getUserProgression(USER);
      expect(prog.level).toBe(2);
    });

    it('stays at level 1 with 99 XP', () => {
      service.addXp(USER, 99);
      const prog = service.getUserProgression(USER);
      expect(prog.level).toBe(1);
      expect(prog.xpToNextLevel).toBe(1);
    });

    it('correctly computes xpToNextLevel mid-level', () => {
      service.addXp(USER, 250); // between L2 (100) and L3 (400)
      const prog = service.getUserProgression(USER);
      expect(prog.level).toBe(2);
      expect(prog.xpToNextLevel).toBe(400 - 250); // 150
    });

    it('at MAX_LEVEL xpToNextLevel is 0 and nextLevelThreshold is null', () => {
      service.addXp(USER, xpThresholdForLevel(MAX_LEVEL));
      const prog = service.getUserProgression(USER);
      expect(prog.level).toBe(MAX_LEVEL);
      expect(prog.xpToNextLevel).toBe(0);
      expect(prog.nextLevelThreshold).toBeNull();
    });

    it('throws NotFoundException for unknown user', () => {
      expect(() => service.getUserProgression('ghost-user-xyz')).toThrow(
        NotFoundException,
      );
    });
  });

  // ---- addXp guard ----

  describe('addXp()', () => {
    it('throws on zero XP', () => {
      expect(() => service.addXp('u', 0)).toThrow();
    });

    it('throws on negative XP', () => {
      expect(() => service.addXp('u', -10)).toThrow();
    });

    it('creates the user record if it does not exist', () => {
      const prog = service.addXp('brand-new-user', 50);
      expect(prog.xp).toBe(50);
    });
  });

  // ---- Leaderboard ----

  describe('getLeaderboard()', () => {
    const USERS = ['lead-alice', 'lead-bob', 'lead-charlie'];

    beforeEach(() => {
      // Reset users and give them distinct XP values
      for (const u of USERS) service.resetXp(u);
      service.addXp(USERS[0], 500); // alice: 500
      service.addXp(USERS[1], 900); // bob:   900  ← highest
      service.addXp(USERS[2], 200); // charlie: 200
    });

    it('returns entries sorted by XP descending', () => {
      const { leaderboard } = service.getLeaderboard(10);
      expect(leaderboard[0].userId).toBe(USERS[1]); // bob first
      expect(leaderboard[1].userId).toBe(USERS[0]); // alice second
      expect(leaderboard[2].userId).toBe(USERS[2]); // charlie third
    });

    it('respects the topN parameter', () => {
      const { leaderboard } = service.getLeaderboard(2);
      expect(leaderboard).toHaveLength(2);
    });

    it('reports totalParticipants correctly', () => {
      const { totalParticipants } = service.getLeaderboard(10);
      expect(totalParticipants).toBeGreaterThanOrEqual(USERS.length);
    });

    it('assigns increasing rank numbers', () => {
      const { leaderboard } = service.getLeaderboard(10);
      leaderboard.forEach((entry, i) => {
        expect(entry.rank).toBe(i + 1);
      });
    });

    it('each entry has a non-empty title', () => {
      const { leaderboard } = service.getLeaderboard(10);
      for (const entry of leaderboard) {
        expect(typeof entry.title).toBe('string');
        expect(entry.title.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getUserLeaderboardPosition(userId)', () => {
    const USERS = ['rank-alice', 'rank-bob', 'rank-charlie'];

    beforeEach(() => {
      // Reset users from all suites so ranks are predictable
      const allKnown = [
        ...USERS,
        'test-user-abc',
        'brand-new-user',
        'u',
        'lead-alice',
        'lead-bob',
        'lead-charlie',
      ];
      for (const u of allKnown) service.resetXp(u);
      service.addXp(USERS[0], 100); // alice:   100
      service.addXp(USERS[1], 700); // bob:     700  ← highest
      service.addXp(USERS[2], 400); // charlie: 400
    });

    it('returns rank 1 for the top user', () => {
      const pos = service.getUserLeaderboardPosition(USERS[1]);
      expect(pos.rank).toBe(1);
    });

    it('returns correct rank for a middle user', () => {
      const pos = service.getUserLeaderboardPosition(USERS[2]);
      expect(pos.rank).toBe(2);
    });

    it('returns correct rank for the last user', () => {
      const pos = service.getUserLeaderboardPosition(USERS[0]);
      expect(pos.rank).toBe(3);
    });

    it('throws NotFoundException for unknown user', () => {
      expect(() =>
        service.getUserLeaderboardPosition('ghost-user'),
      ).toThrow(NotFoundException);
    });

    it('includes totalParticipants count', () => {
      const pos = service.getUserLeaderboardPosition(USERS[1]);
      expect(pos.totalParticipants).toBeGreaterThanOrEqual(USERS.length);
    });
  });

  // ---- Prize pool ----

  describe('getPrizePool() / createPrizePool()', () => {
    it('getPrizePool returns null when no pool exists', () => {
      expect(service.getPrizePool()).toBeNull();
    });

    it('createPrizePool creates a pool with correct values', () => {
      const pool = service.createPrizePool(5000, 'XLM');
      expect(pool.totalAmount).toBe(5000);
      expect(pool.currency).toBe('XLM');
      expect(pool.distributedAt).toBeNull();
      expect(pool.distribution).toEqual([]);
      expect(pool.id).toMatch(/^prize_/);
    });

    it('createPrizePool uses default currency when omitted', () => {
      const pool = service.createPrizePool(100);
      expect(pool.currency).toBe(PRIZE_POOL_DEFAULT_CURRENCY);
    });

    it('createPrizePool throws on non-positive amount', () => {
      expect(() => service.createPrizePool(0)).toThrow();
      expect(() => service.createPrizePool(-10)).toThrow();
    });

    it('getPrizePool returns the latest pool', () => {
      service.createPrizePool(100);
      const second = service.createPrizePool(200);
      const latest = service.getPrizePool();
      expect(latest!.id).toBe(second.id);
      expect(latest!.totalAmount).toBe(200);
    });
  });

  describe('distributePrizes()', () => {
    const USERS = ['dist-alice', 'dist-bob', 'dist-charlie'];

    beforeEach(() => {
      for (const u of USERS) service.resetXp(u);
      service.addXp(USERS[0], 100);
      service.addXp(USERS[1], 200);
      service.addXp(USERS[2], 300);
    });

    it('auto-creates a pool if none exists', () => {
      const result = service.distributePrizes();
      expect(result.totalAmount).toBeGreaterThan(0);
      expect(result.distributedAt).toBeInstanceOf(Date);
    });

    it('distributes prizes to top 10 leaderboard members', () => {
      const result = service.distributePrizes();
      expect(result.distribution.length).toBeGreaterThan(0);
      expect(result.distribution.length).toBeLessThanOrEqual(10);
    });

    it('top rank receives the largest amount', () => {
      const result = service.distributePrizes();
      const amounts = result.distribution.map((d) => d.amount);
      for (let i = 1; i < amounts.length; i++) {
        expect(amounts[i - 1]).toBeGreaterThanOrEqual(amounts[i]);
      }
    });

    it('distribution amounts use the configured percentages', () => {
      const result = service.distributePrizes();
      for (const dist of result.distribution) {
        const config = PRIZE_DISTRIBUTION_PERCENTAGES.find(
          (c) => c.rank === dist.rank,
        );
        expect(config).toBeDefined();
        if (config) {
          const expected = Math.floor(
            (result.totalAmount * config.percentage) / 100,
          );
          expect(dist.amount).toBe(expected);
        }
      }
    });

    it('marks the pool as distributed', () => {
      const result = service.distributePrizes();
      expect(result.distributedAt).toBeInstanceOf(Date);
    });

    it('is idempotent — second call returns same result', () => {
      const first = service.distributePrizes();
      const second = service.distributePrizes();
      expect(second.id).toBe(first.id);
      expect(second.distributedAt).toEqual(first.distributedAt);
  // ---- recordActivity ----

  describe('recordActivity(userId, date, xpAmount)', () => {
    const USER = 'activity-user';
    const BASE_DATE = new Date('2023-01-01T12:00:00Z');

    beforeEach(() => {
      service.resetXp(USER);
    });

    it('records initial activity for a new user', () => {
      const prog = service.recordActivity(USER, BASE_DATE, 100);
      expect(prog.xp).toBe(100);
      expect(prog.streak.currentStreak).toBe(1);
      expect(prog.streak.lastActivityDate).toBe(BASE_DATE.toISOString());
    });

    it('increases streak for consecutive days', () => {
      service.recordActivity(USER, BASE_DATE, 10);
      const nextDay = new Date(BASE_DATE.getTime() + 24 * 60 * 60 * 1000);
      const prog = service.recordActivity(USER, nextDay, 10);

      expect(prog.streak.currentStreak).toBe(2);
      expect(prog.streak.lastActivityDate).toBe(nextDay.toISOString());
    });

    it('does not increase streak for same-day activity', () => {
      service.recordActivity(USER, BASE_DATE, 10);
      const sameDay = new Date(BASE_DATE.getTime() + 1 * 60 * 60 * 1000); // 1 hour later
      const prog = service.recordActivity(USER, sameDay, 10);

      expect(prog.streak.currentStreak).toBe(1);
      expect(prog.streak.lastActivityDate).toBe(sameDay.toISOString());
    });

    it('resets streak if there is a gap of more than one day', () => {
      service.recordActivity(USER, BASE_DATE, 10);
      const gapDay = new Date(BASE_DATE.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days later
      const prog = service.recordActivity(USER, gapDay, 10);

      expect(prog.streak.currentStreak).toBe(1);
      expect(prog.streak.lastActivityDate).toBe(gapDay.toISOString());
    });

    it('awards streak milestone XP', () => {
      // Set streak to STREAK_MILESTONE_DAYS - 1
      for (let i = 0; i < STREAK_MILESTONE_DAYS - 1; i++) {
        const d = new Date(BASE_DATE.getTime() + i * 24 * 60 * 60 * 1000);
        service.recordActivity(USER, d, 10);
      }
      
      // The next day should hit the milestone
      const milestoneDay = new Date(BASE_DATE.getTime() + (STREAK_MILESTONE_DAYS - 1) * 24 * 60 * 60 * 1000);
      const prog = service.recordActivity(USER, milestoneDay, 10);

      // Streak is now STREAK_MILESTONE_DAYS
      expect(prog.streak.currentStreak).toBe(STREAK_MILESTONE_DAYS);
      
      // XP should be: (base_xp * count) + STREAK_MILESTONE_XP
      // 10 * STREAK_MILESTONE_DAYS + STREAK_MILESTONE_XP
      expect(prog.xp).toBe(10 * STREAK_MILESTONE_DAYS + STREAK_MILESTONE_XP);
    });

    it('awards level milestone XP', () => {
      // Reach level 5 (milestone)
      // xpThresholdForLevel(5) = 100 * 4^2 = 1600
      // We use recordActivity to ensure we are testing the logic
      
      // First, get to level 4
      const level4Xp = xpThresholdForLevel(4);
      service.recordActivity(USER, BASE_DATE, level4Xp);
      
      // Now add enough XP to cross level 5
      const prog = service.recordActivity(USER, BASE_DATE, 1000); // 900 + 1000 = 1900, which is level 5 or higher
      
      expect(prog.level).toBeGreaterThanOrEqual(5);
      // It should have awarded LEVEL_MILESTONE_XP
      // Total XP = level4Xp + 1000 + LEVEL_MILESTONE_XP
      expect(prog.xp).toBe(level4Xp + 1000 + LEVEL_MILESTONE_XP);
    });

    it('awards multiple level milestones if crossing several at once', () => {
      // Reach level 1 (0 XP)
      // Add a huge amount of XP to jump to level 11 (milestones at 5 and 10)
      const hugeXp = xpThresholdForLevel(11);
      const prog = service.recordActivity(USER, BASE_DATE, hugeXp);

      expect(prog.level).toBeGreaterThanOrEqual(11);
      // Total XP = hugeXp + 2 * LEVEL_MILESTONE_XP
      expect(prog.xp).toBe(hugeXp + 2 * LEVEL_MILESTONE_XP);
    });
  });
});

// ---- resetXp ----

  describe('resetXp(userId)', () => {
    const USER = 'reset-user';

    beforeEach(() => {
      service.recordActivity(USER, new Date(), 100);
    });

    it('resets XP to 0 and clears streak', () => {
      service.resetXp(USER);
      const prog = service.getUserProgression(USER);
      expect(prog.xp).toBe(0);
      expect(prog.streak.currentStreak).toBe(0);
      expect(prog.streak.lastActivityDate).toBeNull();
    });
  });
});
});