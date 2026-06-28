export interface Badge {
    id: string;
    name: string;
    description: string;
    iconUrl: string;
}
export interface UserBadge {
    badge: Badge;
    awardedAt: string;
    nftTokenId: string;
}
export interface UserBadgesResponse {
    userId: string;
    badges: UserBadge[];
}
export interface BadgeListResponse {
    badges: Badge[];
}
