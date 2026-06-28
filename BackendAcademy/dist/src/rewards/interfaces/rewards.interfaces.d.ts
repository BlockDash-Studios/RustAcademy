export interface LevelThreshold {
    level: number;
    xpRequired: number;
    title: string;
}
export interface StreakInfo {
    currentStreak: number;
    lastActivityDate: string | null;
}
export interface UserProgressionResponse {
    userId: string;
    xp: number;
    level: number;
    xpToNextLevel: number;
    currentLevelThreshold: number;
    nextLevelThreshold: number | null;
    streak: StreakInfo;
}
export interface ThresholdsResponse {
    thresholds: LevelThreshold[];
}
export interface LeaderboardEntry {
    rank: number;
    userId: string;
    xp: number;
    level: number;
    title: string;
}
export interface LeaderboardResponse {
    leaderboard: LeaderboardEntry[];
    totalParticipants: number;
}
export interface UserLeaderboardPosition {
    userId: string;
    rank: number;
    xp: number;
    level: number;
    title: string;
    totalParticipants: number;
}
export interface PrizeDistribution {
    rank: number;
    userId: string;
    amount: number;
    distributedAt: Date;
}
export interface PrizePoolResponse {
    id: string;
    totalAmount: number;
    currency: string;
    distributedAt: Date | null;
    createdAt: Date;
    distribution: PrizeDistribution[];
}
export interface CreatePrizePoolRequest {
    totalAmount: number;
    currency?: string;
}
