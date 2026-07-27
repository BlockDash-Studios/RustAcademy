import { Injectable, OnModuleInit, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { GradingJobEntity, GradingJobStatus } from './entities/grading-job.entity';
import { GradingResultService } from '../submissions/grading-result.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class GradingJobService implements OnModuleInit {
  private readonly logger = new Logger(GradingJobService.name);
  private intervalHandle?: NodeJS.Timeout;

  // Configurable backoff parameters (Issue #360)
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(
    @InjectRepository(GradingJobEntity)
    private readonly repo: Repository<GradingJobEntity>,
    @Inject(forwardRef(() => GradingResultService))
    private readonly gradingResultService: GradingResultService,
    @Optional()
    private readonly notificationsService?: NotificationsService,
    configService?: ConfigService,
  ) {
    this.maxRetries = configService?.get<number>('GRADING_MAX_RETRIES', 5) ?? 5;
    this.baseDelayMs = configService?.get<number>('GRADING_RETRY_BASE_DELAY_MS', 2_000) ?? 2_000;
    this.maxDelayMs = configService?.get<number>('GRADING_RETRY_MAX_DELAY_MS', 120_000) ?? 120_000;
  }

  async onModuleInit() {
    // Start polling loop for retries every 10 seconds
    this.intervalHandle = setInterval(() => this.processPendingJobs().catch(err => this.logger.error(err)), 10_000);
  }

  async enqueueFailedJob(submissionId: string, payload: any, maxAttempts?: number) {
    const job = this.repo.create({
      submissionId,
      payload,
      attempts: 0,
      maxAttempts: maxAttempts ?? this.maxRetries,
      status: GradingJobStatus.PENDING,
      nextRetryAt: new Date(),
    });
    return this.repo.save(job);
  }

  async processOnce() {
    return this.processPendingJobs();
  }

  /**
   * Compute the next retry delay using exponential backoff with configurable
   * base and max caps, plus random jitter to avoid thundering-herd.
   *
   * Formula: min(baseDelayMs * 2^(attempt-1), maxDelayMs) + jitter
   * (Issue #360)
   */
  private nextRetryDelayMs(attempt: number): number {
    const exponential = this.baseDelayMs * Math.pow(2, attempt - 1);
    const capped = Math.min(exponential, this.maxDelayMs);
    const jitter = Math.floor(Math.random() * 1000);
    return capped + jitter;
  }

  private async processPendingJobs() {
    const now = new Date();
    const jobs = await this.repo.find({
      where: {
        status: GradingJobStatus.PENDING,
      },
      order: { createdAt: 'ASC' },
      take: 10,
    });

    for (const job of jobs) {
      if (job.nextRetryAt && job.nextRetryAt > now) continue;

      // mark in progress to avoid duplicate processing
      job.status = GradingJobStatus.IN_PROGRESS;
      await this.repo.save(job);

      try {
        // Attempt to replay the grading result using saved payload
        await this.gradingResultService.saveResult(job.submissionId, job.payload);

        job.status = GradingJobStatus.COMPLETED;
        job.lastError = null;
        await this.repo.save(job);
        this.logger.debug(`Grading job ${job.id} completed`);
      } catch (err: any) {
        job.attempts = (job.attempts || 0) + 1;
        job.lastError = err?.message ?? String(err);

        if (job.attempts >= (job.maxAttempts ?? this.maxRetries)) {
          job.status = GradingJobStatus.FAILED;
          job.nextRetryAt = null;
          this.logger.warn(`Grading job ${job.id} failed permanently: ${job.lastError}`);

          // Issue #360: Notify the submission owner on permanent failure
          this.notifyGradingFailure(job);
        } else {
          job.status = GradingJobStatus.PENDING;
          // Issue #360: Configurable exponential backoff with jitter
          const delayMs = this.nextRetryDelayMs(job.attempts);
          job.nextRetryAt = new Date(Date.now() + delayMs);
          this.logger.debug(
            `Grading job ${job.id} will retry in ${(delayMs / 1000).toFixed(1)}s (attempt ${job.attempts})`,
          );
        }

        await this.repo.save(job);
      }
    }
  }

  /**
   * Issue #360: Send an in-app notification when a grading job permanently fails.
   * Looks up the submission owner via the stored payload userId if available.
   */
  private notifyGradingFailure(job: GradingJobEntity): void {
    if (!this.notificationsService) return;

    const userId =
      typeof job.payload === 'object' && job.payload !== null
        ? (job.payload as any).userId ?? job.payload.graderId
        : undefined;

    if (userId) {
      this.notificationsService.sendGradingFailureAlert(
        userId,
        job.id,
        job.lastError ?? 'Unknown error',
      );
    }
  }

  async shutdown() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
  }
}
