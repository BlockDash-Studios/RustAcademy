import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { StreakService } from './streak.service';
import type { StreakResponse, CheckinResponse } from './interfaces/streak.interfaces';

/**
 * StreakController
 *
 * Exposes the daily streak tracking API.
 *
 * Routes:
 *   GET /rewards/streak/:userId              – user's current streak status
 *   POST /rewards/streak/:userId/checkin     – perform daily check-in
 */
@Controller('rewards/streak')
export class StreakController {
  constructor(private readonly streakService: StreakService) {}

  /**
   * Returns the current streak status for a user.
   *
   * @example
   *   GET /rewards/streak/abc-123
   *   → {
   *       userId: "abc-123",
   *       currentStreak: 5,
   *       longestStreak: 8,
   *       lastCheckin: "2024-01-15T10:30:00Z",
   *       nextCheckinAvailable: "2024-01-17T00:00:00Z",
   *       isStreakAlive: true
   *     }
   */
  @Get(':userId')
  @HttpCode(HttpStatus.OK)
  getStreak(@Param('userId') userId: string): StreakResponse {
    return this.streakService.getStreak(userId);
  }

  /**
   * Performs a daily check-in for a user.
   * Awards XP based on current streak length.
   *
   * @throws BadRequestException if user has already checked in today
   *
   * @example
   *   POST /rewards/streak/abc-123/checkin
   *   → {
   *       userId: "abc-123",
   *       xpAwarded: 25,
   *       newStreak: 3,
   *       longestStreak: 5,
   *       streakBonus: 10,
   *       message: "3 day streak! Keep it up!"
   *     }
   */
  @Post(':userId/checkin')
  @HttpCode(HttpStatus.OK)
  checkIn(@Param('userId') userId: string): CheckinResponse {
    try {
      return this.streakService.checkIn(userId);
    } catch (error) {
      if (error instanceof Error && error.message.includes('already checked in')) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}