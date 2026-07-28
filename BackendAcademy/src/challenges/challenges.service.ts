import { BadRequestException, Injectable } from '@nestjs/common';
import { CastChallengeVoteDto } from './dto/cast-challenge-vote.dto';
import {
  ChallengeVoteResponse,
  ChallengeVoteTally,
  ChallengeVoteValue,
} from './interfaces/challenge-vote.interface';

export interface AttemptInfo {
  challengeId: string;
  userId: string;
  current: number;
  max: number;
  remaining: number;
  allowed: boolean;
}

/** Default maximum attempts per challenge when no explicit limit is configured. */
const DEFAULT_MAX_ATTEMPTS = 3;

@Injectable()
export class ChallengesService {
  private readonly votesByChallenge = new Map<string, Map<string, ChallengeVoteValue>>();

  /** Per-challenge attempt limit overrides. Falls back to DEFAULT_MAX_ATTEMPTS. */
  private readonly maxAttempts = new Map<string, number>();

  /** Per-challenge per-user attempt counters: challengeId -> userId -> count. */
  private readonly attemptCounts = new Map<string, Map<string, number>>();

  // ---------------------------------------------------------------------------
  // Vote tracking
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Attempt limit management
  // ---------------------------------------------------------------------------

  /**
   * Configure the maximum number of attempts allowed for a given challenge.
   * Must be a positive integer.
   */
  setMaxAttempts(challengeId: string, max: number): void {
    const normalizedId = this.normalizeId(challengeId, 'challengeId');
    if (!Number.isInteger(max) || max < 1) {
      throw new BadRequestException({
        error: 'INVALID_MAX_ATTEMPTS',
        message: 'maxAttempts must be a positive integer',
      });
    }
    this.maxAttempts.set(normalizedId, max);
  }

  /**
   * Return the effective max attempt limit for a challenge.
   * Falls back to `DEFAULT_MAX_ATTEMPTS` when no explicit limit has been set.
   */
  getMaxAttempts(challengeId: string): number {
    const normalizedId = this.normalizeId(challengeId, 'challengeId');
    return this.maxAttempts.get(normalizedId) ?? DEFAULT_MAX_ATTEMPTS;
  }

  /**
   * Check whether the user is allowed to submit another attempt.
   */
  checkAttemptLimit(challengeId: string, userId: string): AttemptInfo {
    const normalizedChallengeId = this.normalizeId(challengeId, 'challengeId');
    const normalizedUserId = this.normalizeId(userId, 'userId');
    const max = this.getMaxAttempts(normalizedChallengeId);
    const current = this.attemptCounts.get(normalizedChallengeId)?.get(normalizedUserId) ?? 0;

    return {
      challengeId: normalizedChallengeId,
      userId: normalizedUserId,
      current,
      max,
      remaining: Math.max(0, max - current),
      allowed: current < max,
    };
  }

  /**
   * Record an attempt for the user on the given challenge.
   *
   * @returns The updated attempt count for this user+challenge.
   * @throws BadRequestException if the user has already exhausted their attempts.
   */
  recordAttempt(challengeId: string, userId: string): number {
    const info = this.checkAttemptLimit(challengeId, userId);

    if (!info.allowed) {
      throw new BadRequestException({
        error: 'ATTEMPT_LIMIT_EXCEEDED',
        message: `Maximum attempts (${info.max}) exhausted for challenge "${info.challengeId}"`,
        ...info,
      });
    }

    let perChallenge = this.attemptCounts.get(info.challengeId);
    if (!perChallenge) {
      perChallenge = new Map<string, number>();
      this.attemptCounts.set(info.challengeId, perChallenge);
    }

    const nextCount = info.current + 1;
    perChallenge.set(info.userId, nextCount);
    return nextCount;
  }

  /**
   * Get attempt information for a user on a challenge (read-only).
   */
  getAttemptInfo(challengeId: string, userId: string): AttemptInfo {
    return this.checkAttemptLimit(challengeId, userId);
  }

  /**
   * Reset attempt counters for all challenges (useful in tests or when
   * a challenge period ends).
   */
  resetAttempts(): void {
    this.attemptCounts.clear();
  }

  /**
   * Reset attempt counters for a specific challenge.
   */
  resetAttemptsForChallenge(challengeId: string): void {
    const normalizedId = this.normalizeId(challengeId, 'challengeId');
    this.attemptCounts.delete(normalizedId);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

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
