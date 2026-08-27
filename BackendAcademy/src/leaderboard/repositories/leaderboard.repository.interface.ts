import { LeaderboardEntry } from '../interfaces/leaderboard.interface';

/**
 * Repository interface for leaderboard storage.
 * Isolates persistence concerns from business logic.
 */
export interface ILeaderboardRepository {
  /**
   * Get all leaderboard entries.
   */
  getAllEntries(): Omit<LeaderboardEntry, 'rank'>[];

  /**
   * Get entries filtered by various criteria.
   */
  getFilteredEntries(filters: {
    courseId?: string;
    timeRange?: string;
    category?: string;
    difficulty?: string;
  }): Omit<LeaderboardEntry, 'rank'>[];

  /**
   * Get a specific entry by user ID.
   */
  getEntryByUserId(userId: string): Omit<LeaderboardEntry, 'rank'> | undefined;

  /**
   * Add or update a leaderboard entry.
   */
  upsertEntry(entry: Omit<LeaderboardEntry, 'rank'>): void;

  /**
   * Clear all leaderboard data (useful for testing).
   */
  clearAll(): void;
}
