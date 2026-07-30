import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ChallengesService, AttemptInfo } from './challenges.service';
import { CastChallengeVoteDto } from './dto/cast-challenge-vote.dto';
import {
  ChallengeVoteResponse,
  ChallengeVoteTally,
} from './interfaces/challenge-vote.interface';

@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  // ---------------------------------------------------------------------------
  // Voting
  // ---------------------------------------------------------------------------

  @Post(':challengeId/votes')
  @HttpCode(HttpStatus.OK)
  castVote(
    @Param('challengeId') challengeId: string,
    @Body() dto: CastChallengeVoteDto,
  ): ChallengeVoteResponse {
    return this.challengesService.castVote(challengeId, dto);
  }

  @Get(':challengeId/votes')
  getTally(@Param('challengeId') challengeId: string): ChallengeVoteTally {
    return this.challengesService.getTally(challengeId);
  }

  // ---------------------------------------------------------------------------
  // Attempt-aware challenge submission
  // ---------------------------------------------------------------------------

  /**
   * POST /challenges/:challengeId/submit
   *
   * Record an attempt for the learner on the given challenge. Before recording
   * the attempt the service verifies the learner has not exhausted their
   * allowed attempts.
   *
   * Returns the updated attempt count (1-based) for confirmation.
   *
   * Body:
   *   userId (string, required) – ID of the submitting learner.
   */
  @Post(':challengeId/submit')
  @HttpCode(HttpStatus.OK)
  submitAttempt(
    @Param('challengeId') challengeId: string,
    @Body('userId') userId: string,
  ): { challengeId: string; userId: string; attemptNumber: number } {
    const attemptNumber = this.challengesService.recordAttempt(
      challengeId,
      userId,
    );

    return {
      challengeId,
      userId,
      attemptNumber,
    };
  }

  /**
   * GET /challenges/:challengeId/attempts/:userId
   *
   * Returns the current attempt usage for a learner on a specific challenge.
   */
  @Get(':challengeId/attempts/:userId')
  getAttemptInfo(
    @Param('challengeId') challengeId: string,
    @Param('userId') userId: string,
  ): AttemptInfo {
    return this.challengesService.getAttemptInfo(challengeId, userId);
  }

  /**
   * PUT /challenges/:challengeId/attempts/limit
   *
   * (Admin) Override the maximum number of attempts allowed for a challenge.
   *
   * Body:
   *   maxAttempts (number, required) – Positive integer.
   */
  @Put(':challengeId/attempts/limit')
  @HttpCode(HttpStatus.OK)
  setMaxAttempts(
    @Param('challengeId') challengeId: string,
    @Body('maxAttempts') maxAttempts: number,
  ): { challengeId: string; maxAttempts: number } {
    this.challengesService.setMaxAttempts(challengeId, maxAttempts);
    return { challengeId, maxAttempts };
  }
}
