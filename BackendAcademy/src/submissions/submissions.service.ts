import {
  BadRequestException,
  Injectable,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChallengesService } from '../challenges/challenges.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { SecurityService } from '../security/security.service';
import { SubmissionStatus } from './interfaces/submission-status.enum';
import { CreateSubmissionDto } from './dto/create-submission.dto';

// ── Review queue types ──────────────────────────────────────────

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

/**
 * Result of attachment validation — #365.
 */
export interface AttachmentValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
}

/**
 * Main submissions service combining CRUD, challenge-attempt gating,
 * review-queue management, and attachment scanning (#365).
 */
@Injectable()
export class SubmissionsService {
  private readonly logger = new Logger(SubmissionsService.name);
  private readonly submissions: Array<{
    id: string;
    learnerId: string;
    taskId: string;
    content: string;
    fileUrl?: string;
    fileSize?: number;
    fileType?: string;
    status: SubmissionStatus;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  /** Review queue (flagged submissions) — stored in-memory */
  private readonly flagged: Map<string, FlaggedSubmission> = new Map();

  /** Attachment scanning config from env — #365 */
  private readonly maxAttachmentSizeBytes: number;
  private readonly allowedAttachmentTypes: string[];
  private readonly attachmentScanningEnabled: boolean;

  constructor(
    private readonly challengesService: ChallengesService,
    private readonly monitoringService: MonitoringService,
    @Optional()
    @Inject(SecurityService)
    private readonly securityService?: SecurityService,
    @Optional()
    @Inject(ConfigService)
    private readonly configService?: ConfigService,
  ) {
    this.maxAttachmentSizeBytes =
      this.configService?.get<number>('MAX_ATTACHMENT_SIZE_BYTES') ??
      10 * 1024 * 1024; // 10 MB default

    this.allowedAttachmentTypes = (
      this.configService
        ?.get<string>('ALLOWED_ATTACHMENT_TYPES')
        ?.split(',')
        .map((t) => t.trim().toLowerCase()) ?? [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/gif',
        'image/webp',
        'text/plain',
        'text/rust',
        'application/zip',
        'application/x-tar',
        'application/gzip',
      ]
    );

    this.attachmentScanningEnabled =
      this.configService?.get<string>('ATTACHMENT_SCANNING_ENABLED') !==
      'false';
  }

  // ── Submission CRUD ──────────────────────────────────────────

  create(payload: {
    learnerId: string;
    taskId: string;
    content: string;
    fileUrl?: string;
    fileSize?: number;
    fileType?: string;
  }): string {
    const { learnerId, taskId, content, fileUrl, fileSize, fileType } =
      payload;

    // #365: Validate attachments before accepting the submission
    if (fileUrl) {
      this.validateAttachment(fileSize, fileType);
    }

    // Enforce challenge attempt limit
    this.verifyChallengeAttemptLimit(taskId, learnerId);

    const submission = {
      id: `${Date.now()}`,
      learnerId,
      taskId,
      content,
      fileUrl,
      fileSize,
      fileType,
      status: SubmissionStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.submissions.push(submission);

    // Record the attempt when the submission targets a challenge.
    this.recordChallengeAttempt(taskId, learnerId);

    this.monitoringService.recordDomainEvent(
      'submission_created',
      'submissions',
    );
    return submission;
  }

  // ── Attachment validation — #365 ─────────────────────────────

  /**
   * Validates file attachments for size limits and content-type restrictions.
   *
   * Previously, file uploads could exceed limits or introduce unsupported
   * content types, creating storage and moderation issues. This method
   * checks both size and type before accepting any submission with
   * attachments, and optionally delegates to the security service for
   * deeper content policy scanning.
   *
   * @throws BadRequestException when the attachment violates policy.
   */
  validateAttachment(
    fileSize?: number,
    fileType?: string,
  ): AttachmentValidationResult {
    if (!this.attachmentScanningEnabled) {
      return { valid: true };
    }

    // Check file size
    if (fileSize !== undefined && fileSize > this.maxAttachmentSizeBytes) {
      this.monitoringService.recordDomainEvent(
        'attachment_size_exceeded',
        'submissions',
      );
      throw new BadRequestException({
        error: 'ATTACHMENT_TOO_LARGE',
        message: `Attachment size (${fileSize} bytes) exceeds the maximum allowed size of ${this.maxAttachmentSizeBytes} bytes`,
        maxSize: this.maxAttachmentSizeBytes,
        actualSize: fileSize,
      });
    }

    // Check content type
    if (fileType) {
      const normalizedType = fileType.toLowerCase().trim();
      if (!this.allowedAttachmentTypes.includes(normalizedType)) {
        this.monitoringService.recordDomainEvent(
          'attachment_type_rejected',
          'submissions',
        );
        throw new BadRequestException({
          error: 'ATTACHMENT_TYPE_NOT_ALLOWED',
          message: `Attachment type "${fileType}" is not allowed. Allowed types: ${this.allowedAttachmentTypes.join(', ')}`,
          allowedTypes: this.allowedAttachmentTypes,
          actualType: fileType,
        });
      }
    }

    // Optional: delegate to security service for deeper content policy scan
    if (this.securityService) {
      try {
        const scanResult = this.securityService.scanContentPolicy(
          fileType,
          fileSize,
        );
        if (scanResult && !scanResult.allowed) {
          this.monitoringService.recordDomainEvent(
            'content_policy_violation',
            'submissions',
          );
          throw new BadRequestException({
            error: 'CONTENT_POLICY_VIOLATION',
            message: scanResult.reason ?? 'Attachment violates content policy',
          });
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        this.logger.warn(
          `Content policy scan failed: ${(err as Error).message}`,
        );
      }
    }

    return { valid: true };
  }

  // ── Review queue (flagged submissions) ───────────────────────

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

  assignReviewer(flagId: string, reviewerId: string): FlaggedSubmission {
    const entry = this.flagged.get(flagId);
    if (!entry) throw new BadRequestException('Flagged submission not found');
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
    if (!entry) throw new BadRequestException('Flagged submission not found');
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
    if (!entry) throw new BadRequestException('Flagged submission not found');
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
    if (!entry) throw new BadRequestException('Flagged submission not found');
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
      pendingReview: all.filter(
        (f) => f.status === ReviewQueueStatus.PENDING,
      ).length,
      assigned: all.filter(
        (f) => f.status === ReviewQueueStatus.ASSIGNED,
      ).length,
      underReview: all.filter(
        (f) => f.status === ReviewQueueStatus.UNDER_REVIEW,
      ).length,
      resolved: all.filter(
        (f) => f.status === ReviewQueueStatus.RESOLVED,
      ).length,
      dismissed: all.filter(
        (f) => f.status === ReviewQueueStatus.DISMISSED,
      ).length,
    };
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

  // ── Challenge attempt helpers ────────────────────────────────

  private verifyChallengeAttemptLimit(
    taskId: string,
    learnerId: string,
  ): void {
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

  private recordChallengeAttempt(taskId: string, learnerId: string): void {
    if (!this.isChallengeTask(taskId)) return;

    this.challengesService.recordAttempt(taskId, learnerId);
    this.monitoringService.recordDomainEvent(
      'challenge_attempt_recorded',
      'submissions',
    );
  }

  private isChallengeTask(taskId: string): boolean {
    return taskId?.toLowerCase().startsWith('challenge-');
  }
}
