import { BadgesService } from './badges.service';
import type { BadgeListResponse, UserBadgesResponse } from './interfaces/badges.interfaces';
export declare class BadgesController {
    private readonly badgesService;
    constructor(badgesService: BadgesService);
    getAllBadges(): BadgeListResponse;
    getUserBadges(userId: string): UserBadgesResponse;
    awardBadge(awardPayload: {
        userId: string;
        badgeId: string;
        nftTokenId: string;
    }): UserBadgesResponse;
}
