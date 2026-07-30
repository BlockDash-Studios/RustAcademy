import { Injectable } from '@nestjs/common';
import type {
  StreakResponse,
  CheckinResponse,
  StreakRecord,
} from './interfaces/streak.interfaces';
import {
  STREAK_BONUS_XP,
  BASE_CHECKIN_XP,
  STREAK_BONUS_THRESHOLDS,
  msToNextCheckin,
} from './streak.constants';

/**
 * In-memory streak store used until a persistence layer is wired in.
 *
 * Keyed by userId → streak record.
 * Replace this Map with a TypeORM / Prisma repository call in production
 * – the service interface will remain unchanged.
 */
const streakStore = new Map<string, StreakRecord>();

function getOrCreateRecord(userId: string): StreakRecord {
  const existing = streakStore.get(userId);
  if (existing) return existing;

  const record: StreakRecord = {
    userId,
    currentStreak: 0,
    longestStreak: 0,
    lastCheckin: null,
    totalCheckins: 0,
  };
  streakStore.set(userId, record);
  return record;
}

function canCheckInToday(record: StreakRecord, now: Date): boolean {
  if (!record.lastCheckin) return true;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastCheckinDate = new Date(
    record.lastCheckin.getFullYear(),
    record.lastCheckin.getMonth(),
    record.lastCheckin.getDate(),
  );

  return today.getTime() > lastCheckinDate.getTime();
}

function evaluateStreak(record: StreakRecord, now: Date): number {
  if (!record.lastCheckin) return 1;

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const lastCheckinDate = new Date(
    record.lastCheckin.getFullYear(),
    record.lastCheckin.getMonth(),
    record.lastCheckin.getDate(),
  );

  // If last check-in was yesterday, continue streak
  if (lastCheckinDate.getTime() === yesterday.getTime()) {
    return record.currentStreak + 1;
  }

  // If last check-in was before yesterday, streak is broken
  return 1;
}

function streakBonusXp(streak: number): number {
  let bonus = 0;
  for (const [threshold, bonusXp] of STREAK_BONUS_THRESHOLDS) {
    if (streak >= threshold) {
      bonus += bonusXp;
    }
  }
  return bonus;
}

function totalCheckinXp(streak: number): number {
  return BASE_CHECKIN_XP + streakBonusXp(streak);
}

@Injectable()
export class StreakService {
  /**
   * Returns the current streak status for a given user.
   * If the user has never checked in, returns a zero-streak response.
   */
  getStreak(userId: string): StreakResponse {
    const record = getOrCreateRecord(userId);

    const now = new Date();
    const nextCheckin = new Date(now.getTime() + msToNextCheckin(now));
    const isStreakAlive =
      record.lastCheckin !== null &&
      canCheckInToday(record, new Date(now.getTime() + 86400000)); // +24h

    return {
      userId,
      currentStreak: record.currentStreak,
      longestStreak: record.longestStreak,
      lastCheckin: record.lastCheckin?.toISOString() ?? null,
      nextCheckinAvailable: nextCheckin.toISOString(),
      isStreakAlive,
    };
  }

  /**
   * Performs a daily check-in for a user.
   * Awards XP based on streak length and updates streak counters.
   *
   * @throws Error if user has already checked in today
   */
  checkIn(userId: string): CheckinResponse {
    const record = getOrCreateRecord(userId);
    const now = new Date();

    if (!canCheckInToday(record, now)) {
      const todayStr = now.toISOString().split('T')[0];
      throw new Error(
        `User '${userId}' has already checked in today (${todayStr}).`,
      );
    }

    // Evaluate new streak
    const newStreak = evaluateStreak(record, now);
    const bonus = streakBonusXp(newStreak);
    const xpAwarded = totalCheckinXp(newStreak);

    // Update record
    record.currentStreak = newStreak;
    record.longestStreak = Math.max(record.longestStreak, newStreak);
    record.lastCheckin = now;
    record.totalCheckins += 1;

    let message: string;
    if (newStreak === 1 && record.totalCheckins === 1) {
      message = 'Welcome! Your streak has started.';
    } else if (newStreak === 1) {
      message = 'Streak reset. New streak started!';
    } else if (newStreak <= 7) {
      message = `${newStreak} day streak! Keep it up!`;
    } else if (newStreak <= 30) {
      message = `Amazing ${newStreak} day streak!`;
    } else {
      message = `Incredible ${newStreak} day streak! You're on fire!`;
    }

    return {
      userId,
      xpAwarded,
      newStreak,
      longestStreak: record.longestStreak,
      streakBonus: bonus,
      message,
    };
  }

  /**
   * Resets a user's streak (useful for testing / admin tooling).
   */
  resetStreak(userId: string): void {
    streakStore.set(userId, {
      userId,
      currentStreak: 0,
      longestStreak: 0,
      lastCheckin: null,
      totalCheckins: 0,
    });
  }

  /**
   * Returns the internal streak record (for testing).
   */
  getRecord(userId: string): StreakRecord | undefined {
    return streakStore.get(userId);
  }

  /**
   * Clears all streak data (for testing).
   */
  clearAll(): void {
    streakStore.clear();
  }
}