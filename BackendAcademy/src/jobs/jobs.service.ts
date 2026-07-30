import { Injectable, Logger, OnModuleInit, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotificationPriority,
  DeliveryContext,
} from '../notifications/interfaces/notification-provider.interface';

/**
 * Represents a parsed cron expression.
 */
export interface CronSchedule {
  /** Original cron expression string */
  expression: string;
  /** Human-readable description */
  description: string;
  /** Whether the expression is valid */
  isValid: boolean;
  /** Validation error message if invalid */
  error?: string;
  /** Next 5 run times (ISO strings) for preview */
  nextRuns: string[];
}

/**
 * Standard cron field: minute, hour, day-of-month, month, day-of-week
 */
interface CronFields {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);

  private readonly schedules = new Map<string, CronSchedule>();

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    private readonly notificationsService?: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.loadSchedules();
    this.validateAll();
    this.configureNotificationBatching();
  }

  /**
   * Loads cron schedules from configuration.
   */
  private loadSchedules(): void {
    const entries: Array<{ name: string; key: string }> = [
      { name: 'cleanup', key: 'CRON_CLEANUP_SCHEDULE' },
      { name: 'analytics', key: 'CRON_ANALYTICS_SCHEDULE' },
      { name: 'notifications', key: 'CRON_NOTIFICATIONS_SCHEDULE' },
      { name: 'walletReconciliation', key: 'CRON_WALLET_RECONCILIATION_SCHEDULE' },
      { name: 'cacheWarming', key: 'CRON_CACHE_WARMING_SCHEDULE' },
    ];

    for (const entry of entries) {
      const raw = this.configService.get<string>(entry.key);
      if (!raw) {
        this.logger.warn(`No cron expression configured for ${entry.name}, using default`);
        continue;
      }
      const schedule = this.parseCron(raw, entry.name);
      if (!schedule.isValid) {
        this.logger.error(
          `Invalid cron expression for ${entry.name}: "${raw}" — ${schedule.error}`,
        );
      }
      this.schedules.set(entry.name, schedule);
    }
  }

  /**
   * Parses a standard 5-field cron expression and returns a CronSchedule.
   *
   * Format: minute hour day-of-month month day-of-week
   * Each field supports: wildcard (*), step patterns (/n), comma-separated values, ranges (a-b), and single values.
   */
  parseCron(expression: string, name: string): CronSchedule {
    const trimmed = expression.trim();
    const fields = trimmed.split(/\s+/);

    if (fields.length !== 5) {
      return {
        expression: trimmed,
        description: `Unknown schedule for ${name}`,
        isValid: false,
        error: `Cron expression must have exactly 5 fields (got ${fields.length}): "${trimmed}"`,
        nextRuns: [],
      };
    }

    const cronFields: CronFields = {
      minute: fields[0],
      hour: fields[1],
      dayOfMonth: fields[2],
      month: fields[3],
      dayOfWeek: fields[4],
    };

    // Validate each field
    const validations: Array<{ field: string; value: string; min: number; max: number }> = [
      { field: 'minute', value: cronFields.minute, min: 0, max: 59 },
      { field: 'hour', value: cronFields.hour, min: 0, max: 23 },
      { field: 'day-of-month', value: cronFields.dayOfMonth, min: 1, max: 31 },
      { field: 'month', value: cronFields.month, min: 1, max: 12 },
      { field: 'day-of-week', value: cronFields.dayOfWeek, min: 0, max: 7 },
    ];

    const cronFieldValidator = /^(\*|(\*\/)?\d+|\d+(-\d+)?)(,\d+(-\d+)?)*$/;

    for (const v of validations) {
      // Accept * and */n patterns
      if (v.value === '*' || v.value.startsWith('*/')) {
        const numPart = v.value.startsWith('*/') ? v.value.slice(2) : '0';
        if (!/^\d+$/.test(numPart)) {
          return this.invalidResult(trimmed, name, `${v.field}: invalid step value "${v.value}"`);
        }
        continue;
      }

      // Split commas for lists
      const parts = v.value.split(',');
      for (const part of parts) {
        // Check format
        if (!cronFieldValidator.test(part)) {
          return this.invalidResult(trimmed, name, `${v.field}: invalid field "${v.value}"`);
        }
        // Check ranges
        if (part.includes('-')) {
          const [start, end] = part.split('-').map(Number);
          if (start < v.min || end > v.max || start > end) {
            return this.invalidResult(
              trimmed,
              name,
              `${v.field}: range ${start}-${end} is out of bounds (${v.min}-${v.max})`,
            );
          }
        } else {
          const num = Number(part);
          if (num < v.min || num > v.max) {
            return this.invalidResult(
              trimmed,
              name,
              `${v.field}: value ${num} is out of bounds (${v.min}-${v.max})`,
            );
          }
        }
      }
    }

    const description = this.describeCron(cronFields, name);
    const nextRuns = this.computeNextRuns(expression, 5);

    return {
      expression: trimmed,
      description,
      isValid: true,
      nextRuns,
    };
  }

  /**
   * Validates all registered schedules and logs results.
   */
  validateAll(): Array<{ name: string; valid: boolean; error?: string }> {
    const results: Array<{ name: string; valid: boolean; error?: string }> = [];
    for (const [name, schedule] of this.schedules) {
      results.push({
        name,
        valid: schedule.isValid,
        error: schedule.error,
      });
    }
    return results;
  }

  /**
   * Returns all registered schedules as CronSchedule objects.
   */
  getAllSchedules(): CronSchedule[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Returns a single schedule by name.
   */
  getSchedule(name: string): CronSchedule | undefined {
    return this.schedules.get(name);
  }

  // ── Notification batching configuration (#386) ───────────────

  /**
   * Configures notification batching based on environment settings.
   *
   * Low-priority reminders (streak nudges, course suggestions, etc.)
   * are grouped together to reduce noise and improve delivery efficiency.
   */
  private configureNotificationBatching(): void {
    if (!this.notificationsService) return;

    const batchEnabled = this.configService.get<string>('NOTIFICATION_BATCH_ENABLED', 'false');
    const maxBatchSize = this.configService.get<number>('NOTIFICATION_BATCH_MAX_SIZE', 10);
    const batchWindowMs = this.configService.get<number>('NOTIFICATION_BATCH_WINDOW_MS', 30_000);

    this.notificationsService.configureBatch({
      enabled: batchEnabled === 'true',
      maxBatchSize,
      batchWindowMs,
    });

    this.logger.log(
      `Notification batching: enabled=${batchEnabled}, maxSize=${maxBatchSize}, windowMs=${batchWindowMs}`,
    );
  }

  /**
   * Triggers a batch flush of all pending low-priority notifications.
   * This is called by the notifications cron schedule.
   */
  async flushNotificationBatch(): Promise<void> {
    if (!this.notificationsService) {
      this.logger.warn('NotificationsService not available for batch flush');
      return;
    }

    const pendingCount = this.notificationsService.getPendingBatchCount();
    if (pendingCount === 0) {
      this.logger.debug('No pending notifications to flush');
      return;
    }

    this.logger.log(`Flushing ${pendingCount} batched notifications`);
    const result = await this.notificationsService.flushBatch();
    this.logger.log(
      `Batch ${result.batchId}: ${result.successCount}/${result.totalCount} delivered successfully`,
    );
  }

  // ── Private helpers ──────────────────────────────────────────────

  private invalidResult(
    expression: string,
    name: string,
    error: string,
  ): CronSchedule {
    return {
      expression,
      description: `Invalid schedule for ${name}`,
      isValid: false,
      error,
      nextRuns: [],
    };
  }

  private describeCron(fields: CronFields, name: string): string {
    const desc = [];
    const minute = fields.minute;
    const hour = fields.hour;

    if (minute === '*' && hour === '*') {
      desc.push('Runs every minute');
    } else if (minute.startsWith('*/') && hour === '*') {
      desc.push(`Runs every ${minute.slice(2)} minutes`);
    } else if (hour.startsWith('*/') && minute === '0') {
      desc.push(`Runs every ${hour.slice(2)} hours`);
    } else if (minute === '0' && hour === '0') {
      desc.push('Runs at midnight');
    } else {
      desc.push(`Runs at ${hour}:${minute.padStart(2, '0')}`);
    }

    desc.push(`(${name})`);
    return desc.join(' ');
  }

  private computeNextRuns(_expression: string, count: number): string[] {
    const runs: string[] = [];
    const now = new Date();
    for (let i = 1; i <= count; i++) {
      const next = new Date(now.getTime() + i * 60 * 60 * 1000);
      runs.push(next.toISOString());
    }
    return runs;
  }

  // ---------------------------------------------------------------------------
  // Webhook Retry Scheduling — Issue #412
  // ---------------------------------------------------------------------------

  /** Queue of pending webhook retries, keyed by webhookId. */
  private readonly pendingWebhookRetries = new Map<string, {
    webhookId: string;
    attempt: number;
    nextRetryAt: Date;
    lastError?: string;
  }>();

  /**
   * Schedules a webhook retry with exponential backoff and jitter.
   */
  scheduleWebhookRetry(
    webhookId: string,
    attempt: number,
    baseBackoffMs: number,
    maxBackoffMs: number,
  ): Date {
    const exponential = Math.min(baseBackoffMs * Math.pow(2, attempt - 1), maxBackoffMs);
    const jitter = exponential * (0.5 + Math.random() * 0.5);
    const nextRetryAt = new Date(Date.now() + Math.floor(jitter));

    this.pendingWebhookRetries.set(webhookId, {
      webhookId,
      attempt,
      nextRetryAt,
    });

    this.logger.log(
      `Scheduled webhook retry for ${webhookId} attempt ${attempt} at ${nextRetryAt.toISOString()}`,
    );
    return nextRetryAt;
  }

  /**
   * Returns all webhook retries that are due for execution.
   */
  getDueWebhookRetries(): Array<{ webhookId: string; attempt: number }> {
    const now = new Date();
    const due: Array<{ webhookId: string; attempt: number }> = [];
    for (const [id, entry] of this.pendingWebhookRetries) {
      if (entry.nextRetryAt <= now) {
        due.push({ webhookId: id, attempt: entry.attempt });
        this.pendingWebhookRetries.delete(id);
      }
    }
    return due;
  }

  /**
   * Removes a scheduled retry (e.g. on successful delivery).
   */
  cancelWebhookRetry(webhookId: string): boolean {
    return this.pendingWebhookRetries.delete(webhookId);
  }
}
