import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { RewardsService } from './rewards.service';
import type {
  UserProgressionResponse,
  ThresholdsResponse,
  LevelThreshold,
  LeaderboardResponse,
  UserLeaderboardPosition,
  PrizePoolResponse,
  CreatePrizePoolRequest,
} from './interfaces/rewards.interfaces';

/**
 * RewardsController
 *
 * Exposes the XP, level, and progression-threshold API.
 *
 * Routes:
 *   GET /rewards/thresholds              – full level table (1–50)
 *   GET /rewards/thresholds/:level       – single level threshold
 *   GET /rewards/progression/:userId     – user's XP + current level + progress to next
 */
@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  /**
   * Returns the complete progression table: all 50 levels with their
   * XP requirements and display titles.
   *
   * @example
   *   GET /rewards/thresholds
   *   → { thresholds: [{ level: 1, xpRequired: 0, title: "Newcomer" }, …] }
   */
  @Get('thresholds')
  @HttpCode(HttpStatus.OK)
  getAllThresholds(): ThresholdsResponse {
    return this.rewardsService.getAllThresholds();
  }

  /**
   * Returns the XP threshold and title for a specific level.
   *
   * @param level  Integer between 1 and 50 (inclusive)
   *
   * @example
   *   GET /rewards/thresholds/10
   *   → { level: 10, xpRequired: 8100, title: "Practitioner" }
   */
  @Get('thresholds/:level')
  @HttpCode(HttpStatus.OK)
  getLevelThreshold(
    @Param('level', ParseIntPipe) level: number,
  ): LevelThreshold {
    return this.rewardsService.getLevelThreshold(level);
  }

  /**
   * Returns a user's accumulated XP, current level, XP required to reach
   * the next level, and the raw threshold values for the current and next levels.
   *
   * @param userId  UUID (or any string identifier) of the target user
   *
   * @example
   *   GET /rewards/progression/abc-123
   *   → {
   *       userId: "abc-123",
   *       xp: 550,
   *       level: 3,
   *       xpToNextLevel: 50,
   *       currentLevelThreshold: 400,
   *       nextLevelThreshold: 600
   *     }
   */
  @Get('progression/:userId')
  @HttpCode(HttpStatus.OK)
  getUserProgression(
    @Param('userId') userId: string,
  ): UserProgressionResponse {
    return this.rewardsService.getUserProgression(userId);
  }

  /**
   * Returns the top N users on the leaderboard, sorted by XP descending.
   *
   * @param topN  Number of entries (default 100, query parameter)
   *
   * @example
   *   GET /rewards/leaderboard?topN=10
   *   → { leaderboard: [{ rank: 1, userId: "…", xp: 5000, level: 8, title: "Apprentice 3" }, …] }
   */
  @Get('leaderboard')
  @HttpCode(HttpStatus.OK)
  getLeaderboard(
    @Query('topN', ParseIntPipe) topN: number,
  ): LeaderboardResponse {
    return this.rewardsService.getLeaderboard(topN);
  }

  /**
   * Returns a user's current rank, XP, level, and title.
   *
   * @example
   *   GET /rewards/leaderboard/abc-123
   *   → { userId: "abc-123", rank: 7, xp: 2000, level: 5, title: "Apprentice", totalParticipants: 42 }
   */
  @Get('leaderboard/:userId')
  @HttpCode(HttpStatus.OK)
  getUserLeaderboardPosition(
    @Param('userId') userId: string,
  ): UserLeaderboardPosition {
    return this.rewardsService.getUserLeaderboardPosition(userId);
  }

  /**
   * Returns the current (most recent) prize pool, or 404 if none exist.
   *
   * @example
   *   GET /rewards/prize-pool
   *   → { id: "prize_…", totalAmount: 1000, currency: "XLM", distributedAt: null, … }
   */
  @Get('prize-pool')
  @HttpCode(HttpStatus.OK)
  getPrizePool(): PrizePoolResponse {
    const pool = this.rewardsService.getPrizePool();
    if (!pool) {
      throw new NotFoundException('No prize pool has been created yet.');
    }
    return pool;
  }

  /**
   * Creates a new prize pool with the given amount and optional currency.
   *
   * @example
   *   POST /rewards/prize-pool
   *   { "totalAmount": 5000, "currency": "XLM" }
   *   → { id: "prize_…", totalAmount: 5000, … }
   */
  @Post('prize-pool')
  @HttpCode(HttpStatus.CREATED)
  createPrizePool(
    @Body() body: CreatePrizePoolRequest,
  ): PrizePoolResponse {
    // #363: Support optional expiresAt for redemption expiration checks
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;
    return this.rewardsService.createPrizePool(
      body.totalAmount,
      body.currency,
      expiresAt,
    );
  }

  /**
   * Distributes the current prize pool to the top 10 leaderboard members.
   *
   * @example
   *   POST /rewards/prize-pool/distribute
   *   → { id: "prize_…", totalAmount: 1000, …, distributedAt: "…", distribution: […] }
   */
  @Post('prize-pool/distribute')
  @HttpCode(HttpStatus.OK)
  distributePrizes(): PrizePoolResponse {
    return this.rewardsService.distributePrizes();
  }
}
