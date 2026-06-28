import type { BadgeListResponse, UserBadgesResponse } from './interfaces/badges.interfaces';
export declare class BadgesService {
    getAllBadges(): BadgeListResponse;
    getUserBadges(userId: string): UserBadgesResponse;
    awardBadge(userId: string, badgeId: string, nftTokenId: string): UserBadgesResponse;
    resetUserBadges(userId: string): void;
}
