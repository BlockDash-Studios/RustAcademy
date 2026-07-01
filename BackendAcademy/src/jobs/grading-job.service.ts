import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { GradingJobEntity, GradingJobStatus } from './entities/grading-job.entity';
import { GradingResultService } from '../submissions/grading-result.service';

@Injectable()
export class GradingJobService implements OnModuleInit {
  private readonly logger = new Logger(GradingJobService.name);
  private intervalHandle?: NodeJS.Timeout;

  constructor(
    @InjectRepository(GradingJobEntity)
    private readonly repo: Repository<GradingJobEntity>,
    @Inject(forwardRef(() => GradingResultService))
    private readonly gradingResultService: GradingResultService,
  ) {}

  async onModuleInit() {
    // Start polling loop for retries every 10 seconds
    this.intervalHandle = setInterval(() => this.processPendingJobs().catch(err => this.logger.error(err)), 10_000);
  }

  async enqueueFailedJob(submissionId: string, payload: any, maxAttempts = 5) {
    const job = this.repo.create({
      submissionId,
      payload,
      attempts: 0,
      maxAttempts,
      status: GradingJobStatus.PENDING,
      nextRetryAt: new Date(),
    });
    return this.repo.save(job);
  }

  async processOnce() {
    return this.processPendingJobs();
  }

  private async processPendingJobs() {
    const now = new Date();
    const jobs = await this.repo.find({
      where: {
        status: GradingJobStatus.PENDING,
        // TypeORM can't express nextRetryAt <= now in object form reliably across DBs,
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

        if (job.attempts >= (job.maxAttempts ?? 5)) {
          job.status = GradingJobStatus.FAILED;
          job.nextRetryAt = null;
          this.logger.warn(`Grading job ${job.id} failed permanently: ${job.lastError}`);
        } else {
          job.status = GradingJobStatus.PENDING;
          // exponential backoff (seconds) with jitter
          const base = 2;
          const delaySeconds = base * Math.pow(2, job.attempts - 1);
          const jitterMs = Math.floor(Math.random() * 1000);
          job.nextRetryAt = new Date(Date.now() + delaySeconds * 1000 + jitterMs);
          this.logger.debug(`Grading job ${job.id} will retry in ${delaySeconds}s (attempt ${job.attempts})`);
        }

        await this.repo.save(job);
      }
    }
  }

  async shutdown() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
  }
}
