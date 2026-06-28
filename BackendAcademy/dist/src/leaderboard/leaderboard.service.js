"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaderboardService = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
let LeaderboardService = class LeaderboardService {
    constructor() {
        this.sampleUsers = [
            {
                userId: (0, uuid_1.v4)(),
                username: 'rustmaster',
                avatarUrl: 'https://example.com/avatars/rustmaster.png',
                score: 15420,
                challengesCompleted: 127,
                accuracy: 94.5,
                streak: 45,
            },
            {
                userId: (0, uuid_1.v4)(),
                username: 'codewarrior',
                avatarUrl: 'https://example.com/avatars/codewarrior.png',
                score: 14890,
                challengesCompleted: 118,
                accuracy: 92.3,
                streak: 32,
            },
            {
                userId: (0, uuid_1.v4)(),
                username: 'memorieslock',
                avatarUrl: 'https://example.com/avatars/memorieslock.png',
                score: 14250,
                challengesCompleted: 112,
                accuracy: 91.8,
                streak: 28,
            },
            {
                userId: (0, uuid_1.v4)(),
                username: 'rustacean',
                avatarUrl: 'https://example.com/avatars/rustacean.png',
                score: 13780,
                challengesCompleted: 105,
                accuracy: 89.7,
                streak: 21,
            },
            {
                userId: (0, uuid_1.v4)(),
                username: 'systemshade',
                avatarUrl: 'https://example.com/avatars/systemshade.png',
                score: 13150,
                challengesCompleted: 98,
                accuracy: 88.2,
                streak: 18,
            },
            {
                userId: (0, uuid_1.v4)(),
                username: 'codelover',
                avatarUrl: 'https://example.com/avatars/codelover.png',
                score: 12890,
                challengesCompleted: 92,
                accuracy: 87.5,
                streak: 15,
            },
            {
                userId: (0, uuid_1.v4)(),
                username: 'learningdev',
                avatarUrl: 'https://example.com/avatars/learningdev.png',
                score: 11560,
                challengesCompleted: 85,
                accuracy: 85.3,
                streak: 12,
            },
            {
                userId: (0, uuid_1.v4)(),
                username: 'newbiecoder',
                avatarUrl: 'https://example.com/avatars/newbiecoder.png',
                score: 9870,
                challengesCompleted: 67,
                accuracy: 82.1,
                streak: 8,
            },
        ];
    }
    async getLeaderboard(getLeaderboardDto) {
        const { timeRange = 'allTime', category, difficulty, limit = 10, offset = 0, userId } = getLeaderboardDto;
        let sortedEntries = [...this.sampleUsers]
            .sort((a, b) => b.score - a.score)
            .map((entry, index) => ({
            ...entry,
            rank: index + 1,
        }));
        const paginatedEntries = sortedEntries.slice(offset, offset + limit);
        const total = sortedEntries.length;
        const hasMore = offset + limit < total;
        let userRank;
        if (userId) {
            userRank = sortedEntries.find(entry => entry.userId === userId);
        }
        return {
            entries: paginatedEntries,
            total,
            hasMore,
            filters: {
                timeRange,
                category,
                difficulty,
                limit,
                offset,
            },
            userRank,
        };
    }
};
exports.LeaderboardService = LeaderboardService;
exports.LeaderboardService = LeaderboardService = __decorate([
    (0, common_1.Injectable)()
], LeaderboardService);
//# sourceMappingURL=leaderboard.service.js.map