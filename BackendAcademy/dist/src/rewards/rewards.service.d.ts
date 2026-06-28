import type { LevelThreshold, UserProgressionResponse, ThresholdsResponse, LeaderboardResponse, UserLeaderboardPosition, PrizePoolResponse } from './interfaces/rewards.interfaces';
export declare class RewardsService {
    getAllThresholds(): ThresholdsResponse;
    getLevelThreshold(level: number): LevelThreshold;
    getUserProgression(userId: string): UserProgressionResponse;
    addXp(userId: string, amount: number): UserProgressionResponse;
    recordActivity(userId: string, date: Date, xpAmount: number): UserProgressionResponse;
    resetXp(userId: string): void;
    getLeaderboard(topN?: number): LeaderboardResponse;
    getUserLeaderboardPosition(userId: string): UserLeaderboardPosition;
    getPrizePool(): PrizePoolResponse | null;
    createPrizePool(totalAmount: number, currency?: string): PrizePoolResponse;
    distributePrizes(): PrizePoolResponse;
}
