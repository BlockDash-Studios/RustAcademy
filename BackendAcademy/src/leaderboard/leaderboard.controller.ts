import { Controller, Get, Query } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { GetLeaderboardDto } from './dto/get-leaderboard.dto';
import { LeaderboardResponse } from './interfaces/leaderboard.interface';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  async getLeaderboard(@Query() getLeaderboardDto: GetLeaderboardDto): Promise<LeaderboardResponse> {
    return this.leaderboardService.getLeaderboard(getLeaderboardDto);
  }
}