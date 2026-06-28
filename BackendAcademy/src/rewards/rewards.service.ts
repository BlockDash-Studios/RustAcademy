import { Injectable, NotFoundException } from '@nestjs/common';
import {
  MAX_LEVEL,
  levelForXp,
  xpThresholdForLevel,
  xpToNextLevel,
  LEADERBOARD_DEFAULT_TOP_N,
  PRIZE_DISTRIBUTION_PERCENTAGES,
  PRIZE_POOL_DEFAULT_CURRENCY,
  PRIZE_POOL_DEFAULT_AMOUNT,
  STREAK_MILESTONE_DAYS,
  STREAK_MILESTONE_XP,
  LEVEL_MILESTONE_INTERVAL,
  LEVEL_MILESTONE_XP,
} from './rewards.constants';
import type {
  LevelThreshold,
  UserProgressionResponse,
  ThresholdsResponse,
  LeaderboardResponse,
  UserLeaderboardPosition,
  PrizePoolResponse,
  PrizeDistribution,
} from './interfaces/rewards.interfaces';

/**
 * In-memory XP store used until a persistence layer is wired in.
 *
 * Keyed by userId → total accumulated XP.
 * Replace this Map with a TypeORM / Prisma repository call in
 * production — the service interface will remain unchanged.
 */
const xpStore = new Map<string, number>();

/**
 * In-memory prize pool store.
 *
 * Keyed by pool id → pool data including total amount and distribution records.
 */
interface PrizePoolData {
  totalAmount: number;
  currency: string;
  distributedAt: Date | null;
  createdAt: Date;
  distribution: PrizeDistribution[];
}

const prizePoolStore = new Map<string, PrizePoolData>();

/**
 * In-memory streak store used until a persistence layer is wired in.
 *
 * Keyed by userId → streak information.
 */
const streakStore = new Map<string, { currentStreak: number; lastActivityDate: Date | null }>();

/**
 * Deterministic level title names for display purposes.
 * Covers levels 1-50. Titles repeat their tier name with a numeric suffix
 * beyond the named entries so the list is always complete.
 */
function levelTitle(level: number): string {
  const titles: Record<number, string> = {
    1: 'Newcomer',
    5: 'Apprentice',
    10: 'Practitioner',
    15: 'Journeyman',
    20: 'Specialist',
    25: 'Expert',
    30: 'Senior',
    35: 'Master',
    40: 'Grandmaster',
    45: 'Legend',
    50: 'Academy Champion',
  };
  // Walk backwards to find the closest tier label
  for (let t = level; t >= 1; t--) {
    if (titles[t]) {
      const offset = level - t;
      return offset === 0 ? titles[t] : `${titles[t]} ${offset}`;
    }
  }
  return `Level ${level}`;
}

@Injectable()
export class RewardsService {
  /**
   * Returns the complete list of level thresholds (levels 1 – MAX_LEVEL).
   * This is static configuration data and never changes at runtime.
   */
  getAllThresholds(): ThresholdsResponse {
    const thresholds: LevelThreshold[] = [];
    for (let level = 1; level <= MAX_LEVEL; level++) {
      thresholds.push({
        level,
        xpRequired: xpThresholdForLevel(level),
        title: levelTitle(level),
      });
    }
    return { thresholds };
  }

  /**
   * Returns a single level's threshold details.
   *
   * @throws NotFoundException if the level is outside [1, MAX_LEVEL]
   */
  getLevelThreshold(level: number): LevelThreshold {
    if (level < 1 || level > MAX_LEVEL) {
      throw new NotFoundException(
        `Level ${level} does not exist. Valid range: 1–${MAX_LEVEL}.`,
      );
    }
    return {
      level,
      xpRequired: xpThresholdForLevel(level),
      title: levelTitle(level),
    };
  }

  /**
   * Returns the current XP, level, and progression data for a given user.
   *
   * @throws NotFoundException if the userId is unknown
   */
  getUserProgression(userId: string): UserProgressionResponse {
    const xp = xpStore.get(userId);
    if (xp === undefined) {
      throw new NotFoundException(
        `User '${userId}' not found in the rewards system.`,
      );
    }

    const level = levelForXp(xp);
    const remaining = xpToNextLevel(xp, level);
    const nextThreshold =
      level < MAX_LEVEL ? xpThresholdForLevel(level + 1) : null;

    const streakData = streakStore.get(userId) ?? {
      currentStreak: 0,
      lastActivityDate: null,
    };

    return {
      userId,
      xp,
      level,
      xpToNextLevel: remaining,
      currentLevelThreshold: xpThresholdForLevel(level),
      nextLevelThreshold: nextThreshold,
      streak: {
        currentStreak: streakData.currentStreak,
        lastActivityDate: streakData.lastActivityDate
          ? streakData.lastActivityDate.toISOString()
          : null,
      },
    };
  }

  /**
   * Adds XP to a user, creating the record if it does not yet exist.
   * Used in tests and by future gamification hooks.
   *
   * @param userId   Target user
   * @param amount   XP to add (must be > 0)
   * @returns        Updated progression data
   */
  addXp(userId: string, amount: number): UserProgressionResponse {
    if (amount <= 0) {
      throw new Error('XP amount must be a positive integer.');
    }
    const current = xpStore.get(userId) ?? 0;
    xpStore.set(userId, current + amount);
    return this.getUserProgression(userId);
  }

  /**
   * Records a user activity, updates their streak, and awards XP.
   * Can also award bonus XP for streak and level milestones.
   *
   * @param userId     Target user
   * @param date       Date of activity
   * @param xpAmount   Base XP to award
   * @returns          Updated progression data
   */
  recordActivity(userId: string, date: Date, xpAmount: number): UserProgressionResponse {
    if (xpAmount <= 0) {
      throw new Error('XP amount must be a positive integer.');
    }

    // 1. Update Streak
    const streakData = streakStore.get(userId) ?? {
      currentStreak: 0,
      lastActivityDate: null,
    };
    let streakBonusXp = 0;

    if (streakData.lastActivityDate) {
      const lastDate = new Date(streakData.lastActivityDate);

      const today = new Date(date.getTime());
      today.setHours(0, 0, 0, 0);
      const last = new Date(lastDate.getTime());
      last.setHours(0, 0, 0, 0);

      const diffDays = Math.round(
        (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diffDays === 1) {
        streakData.currentStreak += 1;
      } else if (diffDays > 1) {
        streakData.currentStreak = 1;
      }
      // if diffDays === 0, do nothing to currentStreak
    } else {
      streakData.currentStreak = 1;
    }

    streakData.lastActivityDate = date;
    streakStore.set(userId, streakData);

    // Check streak milestone
    if (
      streakData.currentStreak > 0 &&
      streakData.currentStreak % STREAK_MILESTONE_DAYS === 0
    ) {
      streakBonusXp = STREAK_MILESTONE_XP;
    }

    // 2. Update XP
    const currentXp = xpStore.get(userId) ?? 0;
    const oldLevel = levelForXp(currentXp);
    const newXpBeforeLevelMilestone = currentXp + xpAmount + streakBonusXp;
    const newLevel = levelForXp(newXpBeforeLevelMilestone);

    // Check level milestone
    let levelBonusXp = 0;
    for (let m = LEVEL_MILESTONE_INTERVAL; m <= MAX_LEVEL; m += LEVEL_MILESTONE_INTERVAL) {
      if (oldLevel < m && newLevel >= m) {
        levelBonusXp += LEVEL_MILESTONE_XP;
      }
    }

    xpStore.set(userId, newXpBeforeLevelMilestone + levelBonusXp);

    return this.getUserProgression(userId);
  }

  /**
   * Resets a user's XP to zero (useful for testing / admin tooling).
   */
  resetXp(userId: string): void {
    xpStore.set(userId, 0);
    streakStore.delete(userId);
  }

  // -------------------------------------------------------------------------
  // Leaderboard
  // -------------------------------------------------------------------------

  /**
   * Returns the top N users sorted by XP descending.
   *
   * @param topN  Number of entries to return (defaults to LEADERBOARD_DEFAULT_TOP_N)
   */
  getLeaderboard(topN: number = LEADERBOARD_DEFAULT_TOP_N): LeaderboardResponse {
    const sorted = Array.from(xpStore.entries())
      .map(([userId, xp]) => ({ userId, xp, level: levelForXp(xp) }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, topN)
      .map((entry, index) => ({
        rank: index + 1,
        userId: entry.userId,
        xp: entry.xp,
        level: entry.level,
        title: levelTitle(entry.level),
      }));

    return {
      leaderboard: sorted,
      totalParticipants: xpStore.size,
    };
  }

  /**
   * Returns a single user's position on the leaderboard.
   *
   * @throws NotFoundException if the user has no XP record
   */
  getUserLeaderboardPosition(userId: string): UserLeaderboardPosition {
    if (!xpStore.has(userId)) {
      throw new NotFoundException(
        `User '${userId}' not found in the rewards system.`,
      );
    }

    const entries = Array.from(xpStore.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    const rank = entries.findIndex(([id]) => id === userId) + 1;
    const xp = xpStore.get(userId)!;
    const level = levelForXp(xp);

    return {
      userId,
      rank,
      xp,
      level,
      title: levelTitle(level),
      totalParticipants: xpStore.size,
    };
  }

  // -------------------------------------------------------------------------
  // Prize pool
  // -------------------------------------------------------------------------

  /**
   * Returns the most-recently created prize pool, or `null` if none exist.
   */
  getPrizePool(): PrizePoolResponse | null {
    const pools = Array.from(prizePoolStore.entries());
    if (pools.length === 0) return null;

    const [id, pool] = pools[pools.length - 1];
    return { id, ...pool };
  }

  /**
   * Creates a new prize pool with the given amount and currency.
   * The pool starts undistributed with an empty distribution list.
   */
  createPrizePool(
    totalAmount: number,
    currency: string = PRIZE_POOL_DEFAULT_CURRENCY,
  ): PrizePoolResponse {
    if (totalAmount <= 0) {
      throw new Error('Prize pool totalAmount must be positive.');
    }

    const id = `prize_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const pool: PrizePoolData = {
      totalAmount,
      currency,
      distributedAt: null,
      createdAt: new Date(),
      distribution: [],
    };
    prizePoolStore.set(id, pool);
    return { id, ...pool };
  }

  /**
   * Distributes the current undistributed prize pool to the top 10
   * leaderboard entries according to PRIZE_DISTRIBUTION_PERCENTAGES.
   *
   * If no prize pool exists, one is auto-created with the default amount.
   * If the latest pool has already been distributed, this is a no-op
   * that returns the existing pool.
   *
   * @returns  The final state of the distributed prize pool
   */
  distributePrizes(): PrizePoolResponse {
    // Grab the latest pool, or create one
    const pools = Array.from(prizePoolStore.entries());
    let id: string;
    let pool: PrizePoolData;

    if (pools.length === 0) {
      // Auto-create a default pool
      const created = this.createPrizePool(
        PRIZE_POOL_DEFAULT_AMOUNT,
        PRIZE_POOL_DEFAULT_CURRENCY,
      );
      // Re-fetch from store so we have a mutable reference
      id = created.id;
      pool = prizePoolStore.get(id)!;
    } else {
      [id, pool] = pools[pools.length - 1];
      if (pool.distributedAt) {
        return { id, ...pool };
      }
    }

    const leaderboard = this.getLeaderboard(10);
    const distribution: PrizeDistribution[] = [];

    for (const entry of leaderboard.leaderboard) {
      const config = PRIZE_DISTRIBUTION_PERCENTAGES.find(
        (c) => c.rank === entry.rank,
      );
      if (config) {
        const amount = Math.floor(
          (pool.totalAmount * config.percentage) / 100,
        );
        distribution.push({
          rank: entry.rank,
          userId: entry.userId,
          amount,
          distributedAt: new Date(),
        });
      }
    }

    pool.distribution = distribution;
    pool.distributedAt = new Date();
    prizePoolStore.set(id, pool);

    return { id, ...pool };
  }
}