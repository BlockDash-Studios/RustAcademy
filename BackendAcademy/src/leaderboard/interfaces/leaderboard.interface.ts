export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl?: string;
  score: number;
  challengesCompleted: number;
  accuracy: number;
  streak: number;
}

import type { LeaderboardScope } from '../dto/get-leaderboard.dto';

export interface LeaderboardFilters {
  timeRange?: 'daily' | 'weekly' | 'monthly' | 'allTime';
  category?: string;
  difficulty?: string;
  scope?: LeaderboardScope;
  courseId?: string;
  limit?: number;
  offset?: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
  hasMore: boolean;
  filters: LeaderboardFilters;
  userRank?: LeaderboardEntry;
}