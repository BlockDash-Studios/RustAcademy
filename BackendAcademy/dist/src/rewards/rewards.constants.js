"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRIZE_DISTRIBUTION_PERCENTAGES = exports.PRIZE_POOL_DEFAULT_AMOUNT = exports.PRIZE_POOL_DEFAULT_CURRENCY = exports.LEADERBOARD_DEFAULT_TOP_N = exports.LEVEL_MILESTONE_INTERVAL = exports.LEVEL_MILESTONE_XP = exports.STREAK_MILESTONE_DAYS = exports.STREAK_MILESTONE_XP = exports.MAX_LEVEL = void 0;
exports.xpThresholdForLevel = xpThresholdForLevel;
exports.levelForXp = levelForXp;
exports.xpToNextLevel = xpToNextLevel;
exports.MAX_LEVEL = 50;
exports.STREAK_MILESTONE_XP = 500;
exports.STREAK_MILESTONE_DAYS = 7;
exports.LEVEL_MILESTONE_XP = 1000;
exports.LEVEL_MILESTONE_INTERVAL = 5;
function xpThresholdForLevel(level) {
    if (level <= 1)
        return 0;
    return 100 * (level - 1) * (level - 1);
}
function levelForXp(xp) {
    let level = 1;
    for (let n = 2; n <= exports.MAX_LEVEL; n++) {
        if (xp >= xpThresholdForLevel(n)) {
            level = n;
        }
        else {
            break;
        }
    }
    return level;
}
function xpToNextLevel(xp, level) {
    if (level >= exports.MAX_LEVEL)
        return 0;
    return xpThresholdForLevel(level + 1) - xp;
}
exports.LEADERBOARD_DEFAULT_TOP_N = 100;
exports.PRIZE_POOL_DEFAULT_CURRENCY = 'XLM';
exports.PRIZE_POOL_DEFAULT_AMOUNT = 1000;
exports.PRIZE_DISTRIBUTION_PERCENTAGES = [
    { rank: 1, percentage: 30 },
    { rank: 2, percentage: 20 },
    { rank: 3, percentage: 15 },
    { rank: 4, percentage: 7.5 },
    { rank: 5, percentage: 7.5 },
    { rank: 6, percentage: 4 },
    { rank: 7, percentage: 4 },
    { rank: 8, percentage: 4 },
    { rank: 9, percentage: 4 },
    { rank: 10, percentage: 4 },
];
//# sourceMappingURL=rewards.constants.js.map