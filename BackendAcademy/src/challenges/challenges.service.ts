import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CastChallengeVoteDto } from './dto/cast-challenge-vote.dto';
import {
  ChallengeVoteResponse,
  ChallengeVoteTally,
  ChallengeVoteValue,
} from './interfaces/challenge-vote.interface';
import { GradingJobService } from '../jobs/grading-job.service';

@Injectable()
export class ChallengesService {
  private readonly logger = new Logger(ChallengesService.name);
  private readonly votesByChallenge = new Map<string, Map<string, ChallengeVoteValue>>();

  constructor(private readonly gradingJobService?: GradingJobService) {}

  castVote(challengeId: string, dto: CastChallengeVoteDto): ChallengeVoteResponse {
    const normalizedChallengeId = this.normalizeId(challengeId, 'challengeId');
    const userId = this.normalizeId(dto.userId, 'userId');
    const value = this.normalizeVote(dto.value);

    let votes = this.votesByChallenge.get(normalizedChallengeId);
    if (!votes) {
      votes = new Map<string, ChallengeVoteValue>();
      this.votesByChallenge.set(normalizedChallengeId, votes);
    }

    votes.set(userId, value);
    return {
      ...this.getTally(normalizedChallengeId),
      userId,
      userVote: value,
    };
  }

  getTally(challengeId: string): ChallengeVoteTally {
    const normalizedChallengeId = this.normalizeId(challengeId, 'challengeId');
    const votes = this.votesByChallenge.get(normalizedChallengeId);
    let upvotes = 0;
    let downvotes = 0;

    for (const value of votes?.values() ?? []) {
      if (value === 'up') {
        upvotes += 1;
      } else {
        downvotes += 1;
      }
    }

    return {
      challengeId: normalizedChallengeId,
      downvotes,
      score: upvotes - downvotes,
      totalVotes: upvotes + downvotes,
      upvotes,
    };
  }

  resetVotes(): void {
    this.votesByChallenge.clear();
  }

  // -------------------------------------------------------------------------
  // Issue #360: External evaluation with retry support
  // -------------------------------------------------------------------------

  /**
   * Evaluate a challenge submission using an external grader.
   *
   * If the external evaluation fails (network error, timeout, etc.) the
   * submission payload is enqueued into the GradingJobService for retry
   * with exponential backoff instead of immediately failing.
   *
   * @param submissionId  The submission being evaluated
   * @param evalPayload   The payload to send to the external grader
   * @returns             The grading result if successful, or the enqueued job
   *
   * @throws Error if the GradingJobService is unavailable and evaluation fails
   */
  async evaluateWithRetry(
    submissionId: string,
    evalPayload: Record<string, unknown>,
  ): Promise<{ ok: boolean; jobId?: string; error?: string }> {
    try {
      // Attempt primary evaluation
      const result = await this.callExternalGrader(evalPayload);

      if (!result.ok && this.gradingJobService) {
        // Issue #360: Enqueue for retry with backoff instead of failing
        const job = await this.gradingJobService.enqueueFailedJob(
          submissionId,
          evalPayload,
        );
        this.logger.warn(
          `External grader failed for submission ${submissionId}, enqueued retry job ${job.id}`,
        );
        return { ok: false, jobId: job.id, error: result.error };
      }

      return result;
    } catch (err: any) {
      if (this.gradingJobService) {
        const job = await this.gradingJobService.enqueueFailedJob(
          submissionId,
          evalPayload,
        );
        this.logger.warn(
          `External grader threw for submission ${submissionId}, enqueued retry job ${job.id}`,
        );
        return { ok: false, jobId: job.id, error: err?.message ?? String(err) };
      }
      throw err;
    }
  }

  /**
   * Simulate calling an external evaluation provider.
   * In production this would be a REST/gRPC call to the grading service.
   */
  private async callExternalGrader(
    _payload: Record<string, unknown>,
  ): Promise<{ ok: boolean; error?: string }> {
    // Placeholder: external grader invocation stub.
    // Real implementation would call the configured AI provider or external API.
    return { ok: true };
  }

  private normalizeId(value: string | undefined, field: string): string {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException({
        error: 'INVALID_CHALLENGE_VOTE',
        message: `${field} is required`,
      });
    }
    return normalized;
  }

  private normalizeVote(value: ChallengeVoteValue): ChallengeVoteValue {
    if (value !== 'up' && value !== 'down') {
      throw new BadRequestException({
        error: 'INVALID_CHALLENGE_VOTE',
        message: 'value must be either "up" or "down"',
      });
    }
    return value;
  }
}
