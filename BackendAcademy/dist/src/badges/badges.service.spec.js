"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const badges_service_1 = require("./badges.service");
const common_1 = require("@nestjs/common");
describe('BadgesService', () => {
    let service;
    const USER_ID = 'test-user-123';
    const BADGE_ID = 'first-login';
    const NFT_TOKEN_ID = '0xabc123';
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [badges_service_1.BadgesService],
        }).compile();
        service = module.get(badges_service_1.BadgesService);
    });
    describe('getAllBadges', () => {
        it('should return all defined badges', () => {
            const { badges } = service.getAllBadges();
            expect(badges.length).toBeGreaterThan(0);
            expect(badges[0]).toHaveProperty('id');
            expect(badges[0]).toHaveProperty('name');
        });
    });
    describe('getUserBadges', () => {
        it('should return an empty list for a user with no badges', () => {
            const { badges } = service.getUserBadges(USER_ID);
            expect(badges).toEqual([]);
        });
        it('should return the correct user id', () => {
            const { userId } = service.getUserBadges(USER_ID);
            expect(userId).toBe(USER_ID);
        });
    });
    describe('awardBadge', () => {
        it('should award a badge to a user', () => {
            const response = service.awardBadge(USER_ID, BADGE_ID, NFT_TOKEN_ID);
            expect(response.userId).toBe(USER_ID);
            expect(response.badges.length).toBe(1);
            expect(response.badges[0].badge.id).toBe(BADGE_ID);
            expect(response.badges[0].nftTokenId).toBe(NFT_TOKEN_ID);
        });
        it('should not award the same badge twice to the same user', () => {
            service.awardBadge(USER_ID, BADGE_ID, NFT_TOKEN_ID);
            const response = service.awardBadge(USER_ID, BADGE_ID, 'different-token');
            expect(response.badges.length).toBe(1);
        });
        it('should throw NotFoundException for non-existent badge', () => {
            expect(() => service.awardBadge(USER_ID, 'non-existent', NFT_TOKEN_ID)).toThrow(common_1.NotFoundException);
        });
    });
    describe('resetUserBadges', () => {
        it('should clear all badges for a user', () => {
            service.awardBadge(USER_ID, BADGE_ID, NFT_TOKEN_ID);
            service.resetUserBadges(USER_ID);
            const { badges } = service.getUserBadges(USER_ID);
            expect(badges.length).toBe(0);
        });
    });
});
//# sourceMappingURL=badges.service.spec.js.map