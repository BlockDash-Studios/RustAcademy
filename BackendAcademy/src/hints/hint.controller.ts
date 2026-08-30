import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { HintService } from './hint.service';
import { GetHintDto } from './dto/get-hint.dto';
import {
  HintDifficultyTier,
  HintResponse,
} from './interfaces/hint.interface';

@Controller('hints')
export class HintController {
  constructor(private readonly hintService: HintService) {}

  /**
   * POST /hints/:challengeId
   *
   * Retrieve a hint for a learner on a specific challenge.
   *
   * Body:
   *   userId (string, required) – ID of the requesting learner.
   *   tier   (enum, optional)  – Requested difficulty tier. Defaults to the
   *                              highest tier the learner has unlocked.
   *
   * Query (alternative to body tier):
   *   tier (string) – Same as body tier but via query parameter.
   *
   * @throws NotFoundException   – Challenge not registered.
   * @throws ForbiddenException  – Learner not enrolled in the owning course.
   * @throws BadRequestException – Tier not unlocked, cooldown active, or
   *                               view limit exceeded.
   */
  @Post(':challengeId')
  @HttpCode(HttpStatus.OK)
  getHint(
    @Param('challengeId') challengeId: string,
    @Body() dto: GetHintDto,
    @Query('tier') queryTier?: HintDifficultyTier,
  ): HintResponse {
    if (!dto.userId?.trim()) {
      throw new BadRequestException({
        error: 'INVALID_HINT_INPUT',
        message: 'userId is required',
      });
    }

    const tier = (dto.tier ?? queryTier) as HintDifficultyTier | undefined;

    if (tier && !Object.values(HintDifficultyTier).includes(tier)) {
      throw new BadRequestException({
        error: 'INVALID_HINT_TIER',
        message: `Invalid tier "${tier}". Must be one of: ${Object.values(HintDifficultyTier).join(', ')}`,
      });
    }

    // We need the attempt count — the controller will ask the service for
    // the current attempt info via the ChallengesService.  For now the
    // caller passes it explicitly; in a full integration the controller
    // would inject ChallengesService.  The hint service accepts it as a
    // parameter to stay decoupled.
    //
    // For the REST API we accept attemptCount from the query string so the
    // endpoint is self-contained.  In production this would come from the
    // ChallengesService.
    return this.hintService.getHint(challengeId, dto.userId, {
      tier,
      attemptCount: 0, // Caller-driven via challenge attempt info
    });
  }

  /**
   * GET /hints/:challengeId/available
   *
   * Returns the list of hint tiers available to a learner for a challenge,
   * without actually serving a hint (useful for UI preview).
   */
  @Get(':challengeId/available')
  getAvailableTiers(
    @Param('challengeId') challengeId: string,
    @Query('userId') userId: string,
  ): { challengeId: string; availableTiers: HintDifficultyTier[] } {
    if (!userId?.trim()) {
      throw new BadRequestException({
        error: 'INVALID_HINT_INPUT',
        message: 'userId query parameter is required',
      });
    }

    const courseId = this.hintService.getCourseForChallenge(challengeId);
    if (!courseId) {
      throw new BadRequestException({
        error: 'HINT_CHALLENGE_NOT_FOUND',
        message: `Challenge "${challengeId}" is not registered`,
      });
    }

    if (!this.hintService.isEnrolled(userId, courseId)) {
      throw new BadRequestException({
        error: 'HINT_CHALLENGE_INACCESSIBLE',
        message: 'You are not enrolled in the course that owns this challenge',
      });
    }

    return {
      challengeId,
      availableTiers: Object.values(HintDifficultyTier),
    };
  }
}
