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
import { DatabaseService, CouponRecord } from '../database/database.service';
import { MonitoringService } from '../monitoring/monitoring.service';

const xpStore = new Map<string, number>();

interface PrizePoolData {
  totalAmount: number;
  currency: string;
  distributedAt: Date | null;
  createdAt: Date;
  /** Expiration date after which the pool cannot be distributed (#363) */
  expiresAt: Date | null;
  distribution: PrizeDistribution[];
}

const prizePoolStore = new Map<string, PrizePoolData>();

const streakStore = new Map<string, { currentStreak: number; lastActivityDate: Date | null }>();

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
  constructor(
    private readonly databaseService?: DatabaseService,
    private readonly monitoringService?: MonitoringService,
  ) {}

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

  getLevelThreshold(level: number): LevelThreshold {
    if (level < 1 || level > MAX_LEVEL) {
      throw new NotFoundException(
        `Level ${level} does not exist. Valid range: 1\u2013${MAX_LEVEL}.`,
      );
    }
    return {
      level,
      xpRequired: xpThresholdForLevel(level),
      title: levelTitle(level),
    };
  }

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

  addXp(userId: string, amount: number): UserProgressionResponse {
    if (amount <= 0) {
      throw new Error('XP amount must be a positive integer.');
    }
    const current = xpStore.get(userId) ?? 0;
    xpStore.set(userId, current + amount);
    return this.getUserProgression(userId);
  }

  recordActivity(userId: string, date: Date, xpAmount: number): UserProgressionResponse {
    if (xpAmount <= 0) {
      throw new Error('XP amount must be a positive integer.');
    }

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
    } else {
      streakData.currentStreak = 1;
    }

    streakData.lastActivityDate = date;
    streakStore.set(userId, streakData);

    if (
      streakData.currentStreak > 0 &&
      streakData.currentStreak % STREAK_MILESTONE_DAYS === 0
    ) {
      streakBonusXp = STREAK_MILESTONE_XP;
    }

    const currentXp = xpStore.get(userId) ?? 0;
    const oldLevel = levelForXp(currentXp);
    const newXpBeforeLevelMilestone = currentXp + xpAmount + streakBonusXp;
    const newLevel = levelForXp(newXpBeforeLevelMilestone);

    let levelBonusXp = 0;
    for (let m = LEVEL_MILESTONE_INTERVAL; m <= MAX_LEVEL; m += LEVEL_MILESTONE_INTERVAL) {
      if (oldLevel < m && newLevel >= m) {
        levelBonusXp += LEVEL_MILESTONE_XP;
      }
    }

    xpStore.set(userId, newXpBeforeLevelMilestone + levelBonusXp);

    return this.getUserProgression(userId);
  }

  resetXp(userId: string): void {
    xpStore.set(userId, 0);
    streakStore.delete(userId);
  }

  clearAll(): void {
    xpStore.clear();
    prizePoolStore.clear();
    streakStore.clear();
  }

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

  getPrizePool(): PrizePoolResponse | null {
    const pools = Array.from(prizePoolStore.entries());
    if (pools.length === 0) return null;

    const [id, pool] = pools[pools.length - 1];
    return {
      id,
      ...pool,
      expiresAt: pool.expiresAt ?? null,
    };
  }

  createPrizePool(
    totalAmount: number,
    currency: string = PRIZE_POOL_DEFAULT_CURRENCY,
    expiresAt?: Date,
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
      expiresAt: expiresAt ?? null,
      distribution: [],
    };
    prizePoolStore.set(id, pool);
    return {
      id,
      ...pool,
      expiresAt: pool.expiresAt ?? null,
    };
  }

  /**
   * #363: Checks whether a prize pool has expired and cannot be redeemed.
   */
  private isPoolExpired(pool: PrizePoolData): boolean {
    if (!pool.expiresAt) return false;
    return new Date() > pool.expiresAt;
  }

  distributePrizes(): PrizePoolResponse {
    const pools = Array.from(prizePoolStore.entries());
    let id: string;
    let pool: PrizePoolData;

    if (pools.length === 0) {
      const created = this.createPrizePool(
        PRIZE_POOL_DEFAULT_AMOUNT,
        PRIZE_POOL_DEFAULT_CURRENCY,
      );
      id = created.id;
      pool = prizePoolStore.get(id)!;
    } else {
      [id, pool] = pools[pools.length - 1];
      if (pool.distributedAt) {
        return {
          id,
          ...pool,
          expiresAt: pool.expiresAt ?? null,
        };
      }
    }

    // #363: Prevent distribution of expired prize pools
    if (this.isPoolExpired(pool)) {
      throw new Error(
        `Prize pool ${id} has expired (expired at ${pool.expiresAt?.toISOString()}). ` +
          'Expired pools cannot be distributed. Create a new prize pool.',
      );
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

    if (this.monitoringService) {
      this.monitoringService.recordDomainEvent('prize_distributed', 'rewards');
      this.monitoringService.recordDomainEvent('reward_redemptions', 'rewards');
    }

    return {
      id,
      ...pool,
      expiresAt: pool.expiresAt ?? null,
    };
  }

  async generateCouponFromReward(
    code: string,
    discountType: 'percentage' | 'fixed',
    discountValue: number,
    maxRedemptions: number,
    expiresAt: Date,
  ): Promise<CouponRecord | null> {
    if (!this.databaseService) return null;
    const coupon: CouponRecord = {
      id: `coupon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      code,
      discountType,
      discountValue,
      maxRedemptions,
      currentRedemptions: 0,
      expiresAt,
      minPurchaseAmount: 0,
      applicablePlans: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return this.databaseService.createCoupon(coupon);
  }
}
