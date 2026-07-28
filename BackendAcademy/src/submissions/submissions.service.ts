import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ChallengesService } from '../challenges/challenges.service';
import { MonitoringService } from '../monitoring/monitoring.service';

@Injectable()
export class SubmissionsService {
  private readonly submissions: Array<{
    id: string;
    learnerId: string;
    taskId: string;
    content: string;
  }> = [];

  constructor(
    private readonly challengesService: ChallengesService,
    private readonly monitoringService: MonitoringService,
  ) {}
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';

export enum ReviewQueueStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  UNDER_REVIEW = 'under_review',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export enum FlagReason {
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  PLAGIARISM = 'plagiarism',
  OFF_TOPIC = 'off_topic',
  INCOMPLETE = 'incomplete',
  MANUAL_REVIEW_REQUESTED = 'manual_review_requested',
  OTHER = 'other',
}

export interface FlaggedSubmission {
  id: string;
  submissionId: string;
  flaggedBy: string;
  flagReason: FlagReason;
  comment: string;
  status: ReviewQueueStatus;
  assignedTo?: string;
  assignedAt?: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewQueueMetrics {
  totalFlagged: number;
  pendingReview: number;
  assigned: number;
  underReview: number;
  resolved: number;
  dismissed: number;
}

@Injectable()
export class SubmissionsService {
  private readonly flagged: Map<string, FlaggedSubmission> = new Map();

  flagSubmission(
    submissionId: string,
    flaggedBy: string,
    flagReason: FlagReason,
    comment: string,
  ): FlaggedSubmission {
    const entry: FlaggedSubmission = {
      id: crypto.randomUUID(),
      submissionId,
      flaggedBy,
      flagReason,
      comment,
      status: ReviewQueueStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.flagged.set(entry.id, entry);
    return entry;
  }

  getFlaggedSubmissions(status?: ReviewQueueStatus): FlaggedSubmission[] {
    const all = Array.from(this.flagged.values());
    if (status) {
      return all.filter((f) => f.status === status);
    }
    return all;
  }

  getFlaggedSubmission(id: string): FlaggedSubmission | undefined {
    return this.flagged.get(id);
  }

  create(payload: { learnerId: string; taskId: string; content: string }): string {
    // Check whether the target task is a challenge and enforce the attempt
    // limit before accepting the submission.
    const { learnerId, taskId, content } = payload;

    this.verifyChallengeAttemptLimit(taskId, learnerId);

    const submission = {
      id: `${Date.now()}`,
      learnerId,
      taskId,
      content,
  assignReviewer(flagId: string, reviewerId: string): FlaggedSubmission {
    const entry = this.flagged.get(flagId);
    if (!entry) throw new NotFoundException('Flagged submission not found');
    if (entry.status !== ReviewQueueStatus.PENDING) {
      throw new BadRequestException('Only pending flags can be assigned');
    }
    entry.assignedTo = reviewerId;
    entry.assignedAt = new Date();
    entry.status = ReviewQueueStatus.ASSIGNED;
    entry.updatedAt = new Date();
    return entry;
  }

  startReview(flagId: string, reviewerId: string): FlaggedSubmission {
    const entry = this.flagged.get(flagId);
    if (!entry) throw new NotFoundException('Flagged submission not found');
    if (entry.assignedTo !== reviewerId) {
      throw new BadRequestException('This flag is not assigned to you');
    }
    if (entry.status !== ReviewQueueStatus.ASSIGNED) {
      throw new BadRequestException('Flag must be assigned before review');
    }
    entry.status = ReviewQueueStatus.UNDER_REVIEW;
    entry.updatedAt = new Date();
    return entry;
  }

  resolveFlag(
    flagId: string,
    reviewerId: string,
    resolutionNote?: string,
  ): FlaggedSubmission {
    const entry = this.flagged.get(flagId);
    if (!entry) throw new NotFoundException('Flagged submission not found');
    if (entry.assignedTo !== reviewerId) {
      throw new BadRequestException('This flag is not assigned to you');
    }
    entry.status = ReviewQueueStatus.RESOLVED;
    entry.resolvedAt = new Date();
    entry.resolvedBy = reviewerId;
    entry.resolutionNote = resolutionNote;
    entry.updatedAt = new Date();
    return entry;
  }

  dismissFlag(flagId: string, dismissedBy: string): FlaggedSubmission {
    const entry = this.flagged.get(flagId);
    if (!entry) throw new NotFoundException('Flagged submission not found');
    entry.status = ReviewQueueStatus.DISMISSED;
    entry.resolvedAt = new Date();
    entry.resolvedBy = dismissedBy;
    entry.updatedAt = new Date();
    return entry;
  }

  getQueueMetrics(): ReviewQueueMetrics {
    const all = Array.from(this.flagged.values());
    return {
      totalFlagged: all.length,
      pendingReview: all.filter((f) => f.status === ReviewQueueStatus.PENDING).length,
      assigned: all.filter((f) => f.status === ReviewQueueStatus.ASSIGNED).length,
      underReview: all.filter((f) => f.status === ReviewQueueStatus.UNDER_REVIEW).length,
      resolved: all.filter((f) => f.status === ReviewQueueStatus.RESOLVED).length,
      dismissed: all.filter((f) => f.status === ReviewQueueStatus.DISMISSED).length,
    };
  }

    this.submissions.push(submission);

    // Record the attempt when the submission targets a challenge.
    this.recordChallengeAttempt(taskId, learnerId);

    this.monitoringService.recordDomainEvent('submission_created', 'submissions');
    return JSON.stringify(submission);
  }

  /**
   * Check whether the given task is a known challenge. If so, verify that
   * the learner has not exhausted their allowed attempts.
   *
   * This method treats any taskId that starts with "challenge-" as a challenge
   * task, which aligns with the convention used in the `ChallengesService`.
   *
   * @throws BadRequestException when the attempt limit has been exceeded.
   */
  private verifyChallengeAttemptLimit(taskId: string, learnerId: string): void {
    if (!this.isChallengeTask(taskId)) return;

    const info = this.challengesService.checkAttemptLimit(taskId, learnerId);
    if (!info.allowed) {
      this.monitoringService.recordDomainEvent(
        'attempt_limit_exceeded',
        'submissions',
      );
      throw new BadRequestException({
        error: 'ATTEMPT_LIMIT_EXCEEDED',
        message: `Maximum attempts (${info.max}) exhausted for challenge "${info.challengeId}"`,
        ...info,
      });
    }
  }

  /**
   * Record an attempt for the learner on the challenge task, if applicable.
   *
   * This is called after `verifyChallengeAttemptLimit` has already confirmed
   * the user is within their allowed limit, so `recordAttempt` is guaranteed
   * to succeed. No try/catch is needed.
   */
  private recordChallengeAttempt(taskId: string, learnerId: string): void {
    if (!this.isChallengeTask(taskId)) return;

    this.challengesService.recordAttempt(taskId, learnerId);
    this.monitoringService.recordDomainEvent('challenge_attempt_recorded', 'submissions');
  }

  /**
   * Decide whether a taskId references a challenge.
   *
   * This heuristic checks for the `challenge-` prefix convention.
   *
   * @todo Replace this heuristic with a proper challenge→task lookup when a
   *       challenge entity or registry is available (e.g. a database table
   *       that maps challenge IDs to task IDs).
   */
  private isChallengeTask(taskId: string): boolean {
    return taskId?.toLowerCase().startsWith('challenge-');
  }
}
  getFlagsByReviewer(reviewerId: string): FlaggedSubmission[] {
    return Array.from(this.flagged.values()).filter(
      (f) => f.assignedTo === reviewerId,
    );
  }

  getFlagsBySubmission(submissionId: string): FlaggedSubmission[] {
    return Array.from(this.flagged.values()).filter(
      (f) => f.submissionId === submissionId,
    );
  }
}
