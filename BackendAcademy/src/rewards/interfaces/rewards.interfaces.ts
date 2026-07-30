/**
 * Single level entry as returned by the thresholds endpoint.
 */
export interface LevelThreshold {
  /** Level number (1 – 50) */
  level: number;
  /** Total XP required to reach this level */
  xpRequired: number;
  /** Human-readable label */
  title: string;
}

/**
 * Information about a user's current activity streak.
 */
export interface StreakInfo {
  /** Number of consecutive days of activity */
  currentStreak: number;
  /** The last date on which the user was active (ISO 8601 format) */
  lastActivityDate: string | null;
}

/**
 * Response shape for GET /rewards/progression/:userId
 */
export interface UserProgressionResponse {
  userId: string;
  xp: number;
  level: number;
  xpToNextLevel: number;
  /** XP required to enter the current level */
  currentLevelThreshold: number;
  /** XP required to enter the next level (null at max level) */
  nextLevelThreshold: number | null;
  /** User's current activity streak information */
  streak: StreakInfo;
}

/**
 * Response shape for GET /rewards/thresholds
 */
export interface ThresholdsResponse {
  thresholds: LevelThreshold[];
}

// ---------------------------------------------------------------------------
// Leaderboard types
// ---------------------------------------------------------------------------

/**
 * A single entry on the leaderboard.
 */
export interface LeaderboardEntry {
  /** Position (1-based) */
  rank: number;
  userId: string;
  xp: number;
  level: number;
  /** Human-readable level title */
  title: string;
}

/**
 * Response shape for GET /rewards/leaderboard
 */
export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  /** Total number of participants in the XP system */
  totalParticipants: number;
}

/**
 * Response shape for GET /rewards/leaderboard/:userId
 */
export interface UserLeaderboardPosition {
  userId: string;
  /** Current 1-based rank */
  rank: number;
  xp: number;
  level: number;
  title: string;
  totalParticipants: number;
}

// ---------------------------------------------------------------------------
// Prize pool types
// ---------------------------------------------------------------------------

/**
 * A single prize distribution to a user.
 */
export interface PrizeDistribution {
  rank: number;
  userId: string;
  amount: number;
  distributedAt: Date;
}

/**
 * Response shape for prize pool endpoints.
 */
export interface PrizePoolResponse {
  id: string;
  totalAmount: number;
  currency: string;
  distributedAt: Date | null;
  createdAt: Date;
  /** Expiration date for the prize pool; after this date it cannot be distributed (#363) */
  expiresAt: Date | null;
  distribution: PrizeDistribution[];
}

/**
 * Body shape for POST /rewards/prize-pool
 */
export interface CreatePrizePoolRequest {
  totalAmount: number;
  currency?: string;
  /** Optional expiration date for the prize pool (#363) */
  expiresAt?: string;
}
