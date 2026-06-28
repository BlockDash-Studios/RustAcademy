"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const challenges_service_1 = require("./challenges.service");
describe('ChallengesService', () => {
    let service;
    beforeEach(() => {
        service = new challenges_service_1.ChallengesService();
    });
    it('records an upvote and returns the tally', () => {
        const result = service.castVote('weekly-rust-1', {
            userId: 'learner-1',
            value: 'up',
        });
        expect(result).toEqual({
            challengeId: 'weekly-rust-1',
            downvotes: 0,
            score: 1,
            totalVotes: 1,
            upvotes: 1,
            userId: 'learner-1',
            userVote: 'up',
        });
    });
    it('updates a repeated user vote instead of double counting', () => {
        service.castVote('weekly-rust-1', { userId: 'learner-1', value: 'up' });
        service.castVote('weekly-rust-1', { userId: 'learner-1', value: 'down' });
        service.castVote('weekly-rust-1', { userId: 'learner-2', value: 'up' });
        expect(service.getTally('weekly-rust-1')).toEqual({
            challengeId: 'weekly-rust-1',
            downvotes: 1,
            score: 0,
            totalVotes: 2,
            upvotes: 1,
        });
    });
    it('keeps challenge tallies isolated', () => {
        service.castVote('challenge-a', { userId: 'learner-1', value: 'up' });
        service.castVote('challenge-b', { userId: 'learner-1', value: 'down' });
        expect(service.getTally('challenge-a').score).toBe(1);
        expect(service.getTally('challenge-b').score).toBe(-1);
    });
    it('rejects invalid vote values', () => {
        expect(() => service.castVote('challenge-a', {
            userId: 'learner-1',
            value: 'maybe',
        })).toThrow(common_1.BadRequestException);
    });
});
//# sourceMappingURL=challenges.service.spec.js.map