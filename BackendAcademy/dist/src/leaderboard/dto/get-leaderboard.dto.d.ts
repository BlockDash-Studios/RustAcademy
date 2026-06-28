export declare class GetLeaderboardDto {
    timeRange?: 'daily' | 'weekly' | 'monthly' | 'allTime';
    category?: string;
    difficulty?: string;
    limit?: number;
    offset?: number;
    userId?: string;
}
