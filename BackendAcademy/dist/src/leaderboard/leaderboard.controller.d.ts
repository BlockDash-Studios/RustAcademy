import { LeaderboardService } from './leaderboard.service';
import { GetLeaderboardDto } from './dto/get-leaderboard.dto';
import { LeaderboardResponse } from './interfaces/leaderboard.interface';
export declare class LeaderboardController {
    private readonly leaderboardService;
    constructor(leaderboardService: LeaderboardService);
    getLeaderboard(getLeaderboardDto: GetLeaderboardDto): Promise<LeaderboardResponse>;
}
