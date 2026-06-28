export declare const MAX_LEVEL = 50;
export declare const STREAK_MILESTONE_XP = 500;
export declare const STREAK_MILESTONE_DAYS = 7;
export declare const LEVEL_MILESTONE_XP = 1000;
export declare const LEVEL_MILESTONE_INTERVAL = 5;
export declare function xpThresholdForLevel(level: number): number;
export declare function levelForXp(xp: number): number;
export declare function xpToNextLevel(xp: number, level: number): number;
export declare const LEADERBOARD_DEFAULT_TOP_N = 100;
export declare const PRIZE_POOL_DEFAULT_CURRENCY = "XLM";
export declare const PRIZE_POOL_DEFAULT_AMOUNT = 1000;
export declare const PRIZE_DISTRIBUTION_PERCENTAGES: {
    rank: number;
    percentage: number;
}[];
