"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChallengesService = void 0;
const common_1 = require("@nestjs/common");
let ChallengesService = class ChallengesService {
    constructor() {
        this.votesByChallenge = new Map();
    }
    castVote(challengeId, dto) {
        const normalizedChallengeId = this.normalizeId(challengeId, 'challengeId');
        const userId = this.normalizeId(dto.userId, 'userId');
        const value = this.normalizeVote(dto.value);
        let votes = this.votesByChallenge.get(normalizedChallengeId);
        if (!votes) {
            votes = new Map();
            this.votesByChallenge.set(normalizedChallengeId, votes);
        }
        votes.set(userId, value);
        return {
            ...this.getTally(normalizedChallengeId),
            userId,
            userVote: value,
        };
    }
    getTally(challengeId) {
        const normalizedChallengeId = this.normalizeId(challengeId, 'challengeId');
        const votes = this.votesByChallenge.get(normalizedChallengeId);
        let upvotes = 0;
        let downvotes = 0;
        for (const value of votes?.values() ?? []) {
            if (value === 'up') {
                upvotes += 1;
            }
            else {
                downvotes += 1;
            }
        }
        return {
            challengeId: normalizedChallengeId,
            downvotes,
            score: upvotes - downvotes,
            totalVotes: upvotes + downvotes,
            upvotes,
        };
    }
    resetVotes() {
        this.votesByChallenge.clear();
    }
    normalizeId(value, field) {
        const normalized = value?.trim();
        if (!normalized) {
            throw new common_1.BadRequestException({
                error: 'INVALID_CHALLENGE_VOTE',
                message: `${field} is required`,
            });
        }
        return normalized;
    }
    normalizeVote(value) {
        if (value !== 'up' && value !== 'down') {
            throw new common_1.BadRequestException({
                error: 'INVALID_CHALLENGE_VOTE',
                message: 'value must be either "up" or "down"',
            });
        }
        return value;
    }
};
exports.ChallengesService = ChallengesService;
exports.ChallengesService = ChallengesService = __decorate([
    (0, common_1.Injectable)()
], ChallengesService);
//# sourceMappingURL=challenges.service.js.map