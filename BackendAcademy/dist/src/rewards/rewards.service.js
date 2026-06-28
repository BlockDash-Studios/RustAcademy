"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RewardsService = void 0;
const common_1 = require("@nestjs/common");
const rewards_constants_1 = require("./rewards.constants");
const xpStore = new Map();
const prizePoolStore = new Map();
const streakStore = new Map();
function levelTitle(level) {
    const titles = {
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
let RewardsService = class RewardsService {
    getAllThresholds() {
        const thresholds = [];
        for (let level = 1; level <= rewards_constants_1.MAX_LEVEL; level++) {
            thresholds.push({
                level,
                xpRequired: (0, rewards_constants_1.xpThresholdForLevel)(level),
                title: levelTitle(level),
            });
        }
        return { thresholds };
    }
    getLevelThreshold(level) {
        if (level < 1 || level > rewards_constants_1.MAX_LEVEL) {
            throw new common_1.NotFoundException(`Level ${level} does not exist. Valid range: 1–${rewards_constants_1.MAX_LEVEL}.`);
        }
        return {
            level,
            xpRequired: (0, rewards_constants_1.xpThresholdForLevel)(level),
            title: levelTitle(level),
        };
    }
    getUserProgression(userId) {
        const xp = xpStore.get(userId);
        if (xp === undefined) {
            throw new common_1.NotFoundException(`User '${userId}' not found in the rewards system.`);
        }
        const level = (0, rewards_constants_1.levelForXp)(xp);
        const remaining = (0, rewards_constants_1.xpToNextLevel)(xp, level);
        const nextThreshold = level < rewards_constants_1.MAX_LEVEL ? (0, rewards_constants_1.xpThresholdForLevel)(level + 1) : null;
        const streakData = streakStore.get(userId) ?? {
            currentStreak: 0,
            lastActivityDate: null,
        };
        return {
            userId,
            xp,
            level,
            xpToNextLevel: remaining,
            currentLevelThreshold: (0, rewards_constants_1.xpThresholdForLevel)(level),
            nextLevelThreshold: nextThreshold,
            streak: {
                currentStreak: streakData.currentStreak,
                lastActivityDate: streakData.lastActivityDate
                    ? streakData.lastActivityDate.toISOString()
                    : null,
            },
        };
    }
    addXp(userId, amount) {
        if (amount <= 0) {
            throw new Error('XP amount must be a positive integer.');
        }
        const current = xpStore.get(userId) ?? 0;
        xpStore.set(userId, current + amount);
        return this.getUserProgression(userId);
    }
    recordActivity(userId, date, xpAmount) {
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
            const diffDays = Math.round((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
                streakData.currentStreak += 1;
            }
            else if (diffDays > 1) {
                streakData.currentStreak = 1;
            }
        }
        else {
            streakData.currentStreak = 1;
        }
        streakData.lastActivityDate = date;
        streakStore.set(userId, streakData);
        if (streakData.currentStreak > 0 &&
            streakData.currentStreak % rewards_constants_1.STREAK_MILESTONE_DAYS === 0) {
            streakBonusXp = rewards_constants_1.STREAK_MILESTONE_XP;
        }
        const currentXp = xpStore.get(userId) ?? 0;
        const oldLevel = (0, rewards_constants_1.levelForXp)(currentXp);
        const newXpBeforeLevelMilestone = currentXp + xpAmount + streakBonusXp;
        const newLevel = (0, rewards_constants_1.levelForXp)(newXpBeforeLevelMilestone);
        let levelBonusXp = 0;
        for (let m = rewards_constants_1.LEVEL_MILESTONE_INTERVAL; m <= rewards_constants_1.MAX_LEVEL; m += rewards_constants_1.LEVEL_MILESTONE_INTERVAL) {
            if (oldLevel < m && newLevel >= m) {
                levelBonusXp += rewards_constants_1.LEVEL_MILESTONE_XP;
            }
        }
        xpStore.set(userId, newXpBeforeLevelMilestone + levelBonusXp);
        return this.getUserProgression(userId);
    }
    resetXp(userId) {
        xpStore.set(userId, 0);
        streakStore.delete(userId);
    }
    getLeaderboard(topN = rewards_constants_1.LEADERBOARD_DEFAULT_TOP_N) {
        const sorted = Array.from(xpStore.entries())
            .map(([userId, xp]) => ({ userId, xp, level: (0, rewards_constants_1.levelForXp)(xp) }))
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
    getUserLeaderboardPosition(userId) {
        if (!xpStore.has(userId)) {
            throw new common_1.NotFoundException(`User '${userId}' not found in the rewards system.`);
        }
        const entries = Array.from(xpStore.entries()).sort((a, b) => b[1] - a[1]);
        const rank = entries.findIndex(([id]) => id === userId) + 1;
        const xp = xpStore.get(userId);
        const level = (0, rewards_constants_1.levelForXp)(xp);
        return {
            userId,
            rank,
            xp,
            level,
            title: levelTitle(level),
            totalParticipants: xpStore.size,
        };
    }
    getPrizePool() {
        const pools = Array.from(prizePoolStore.entries());
        if (pools.length === 0)
            return null;
        const [id, pool] = pools[pools.length - 1];
        return { id, ...pool };
    }
    createPrizePool(totalAmount, currency = rewards_constants_1.PRIZE_POOL_DEFAULT_CURRENCY) {
        if (totalAmount <= 0) {
            throw new Error('Prize pool totalAmount must be positive.');
        }
        const id = `prize_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const pool = {
            totalAmount,
            currency,
            distributedAt: null,
            createdAt: new Date(),
            distribution: [],
        };
        prizePoolStore.set(id, pool);
        return { id, ...pool };
    }
    distributePrizes() {
        const pools = Array.from(prizePoolStore.entries());
        let id;
        let pool;
        if (pools.length === 0) {
            const created = this.createPrizePool(rewards_constants_1.PRIZE_POOL_DEFAULT_AMOUNT, rewards_constants_1.PRIZE_POOL_DEFAULT_CURRENCY);
            id = created.id;
            pool = prizePoolStore.get(id);
        }
        else {
            [id, pool] = pools[pools.length - 1];
            if (pool.distributedAt) {
                return { id, ...pool };
            }
        }
        const leaderboard = this.getLeaderboard(10);
        const distribution = [];
        for (const entry of leaderboard.leaderboard) {
            const config = rewards_constants_1.PRIZE_DISTRIBUTION_PERCENTAGES.find((c) => c.rank === entry.rank);
            if (config) {
                const amount = Math.floor((pool.totalAmount * config.percentage) / 100);
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
        return { id, ...pool };
    }
};
exports.RewardsService = RewardsService;
exports.RewardsService = RewardsService = __decorate([
    (0, common_1.Injectable)()
], RewardsService);
//# sourceMappingURL=rewards.service.js.map