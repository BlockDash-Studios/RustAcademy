import { GetLeaderboardDto } from './dto/get-leaderboard.dto';
import { LeaderboardResponse } from './interfaces/leaderboard.interface';
export declare class LeaderboardService {
    private sampleUsers;
    getLeaderboard(getLeaderboardDto: GetLeaderboardDto): Promise<LeaderboardResponse>;
}
