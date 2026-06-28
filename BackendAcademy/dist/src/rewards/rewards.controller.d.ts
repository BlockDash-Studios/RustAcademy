import { RewardsService } from './rewards.service';
import type { UserProgressionResponse, ThresholdsResponse, LevelThreshold, LeaderboardResponse, UserLeaderboardPosition, PrizePoolResponse, CreatePrizePoolRequest } from './interfaces/rewards.interfaces';
export declare class RewardsController {
    private readonly rewardsService;
    constructor(rewardsService: RewardsService);
    getAllThresholds(): ThresholdsResponse;
    getLevelThreshold(level: number): LevelThreshold;
    getUserProgression(userId: string): UserProgressionResponse;
    getLeaderboard(topN: number): LeaderboardResponse;
    getUserLeaderboardPosition(userId: string): UserLeaderboardPosition;
    getPrizePool(): PrizePoolResponse;
    createPrizePool(body: CreatePrizePoolRequest): PrizePoolResponse;
    distributePrizes(): PrizePoolResponse;
}
