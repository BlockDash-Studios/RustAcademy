import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isFeatureEnabled } from '../config/env.schema';

/**
 * Represents a parsed cron expression.
 */
export interface CronSchedule {
  expression: string;
  description: string;
  isValid: boolean;
  error?: string;
  nextRuns: string[];
}

interface CronFields {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

/**
 * Result of a contract event replay job execution.
 */
export interface ReplayJobResult {
  jobId: string;
  contractId: string;
  eventsProcessed: number;
  status: 'completed' | 'failed';
  executedAt: Date;
  durationMs: number;
  error?: string;
}

/**
 * A competition tracked for automatic lifecycle transitions (#competition mode).
 */
interface TrackedCompetition {
  competitionId: string;
  endsAt: Date;
  resetScheduledAt?: Date;
}

/**
 * Record of an automatic (or manually-logged) competition reset.
 */
export interface CompetitionResetLogEntry {
  competitionId: string;
  resetAt: Date;
  reason: 'time-boxed-end' | 'manual';
}

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);
  private readonly schedules = new Map<string, CronSchedule>();

  /** #394: History of replay job executions */
  private readonly replayJobHistory: ReplayJobResult[] = [];

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.loadSchedules();
    this.validateAll();

    // #376: Start periodic heartbeat for readiness probes
    this.lastHeartbeat = new Date();
    setInterval(() => {
      this.heartbeat();
    }, 30_000); // heartbeat every 30 seconds

    // #394: Log replay availability
    const replayEnabled = isFeatureEnabled(
      this.configService.get<string>('CONTRACT_EVENT_REPLAY_ENABLED'),
    );
    if (replayEnabled) {
      this.logger.log('Contract event replay jobs are ENABLED');
    } else {
      this.logger.log(
        'Contract event replay jobs are DISABLED. ' +
          'Set CONTRACT_EVENT_REPLAY_ENABLED=true to enable.',
      );
    }

    // #competition: Log competition mode availability
    if (this.isCompetitionModeEnabled()) {
      this.logger.log('Competition mode jobs (time-boxed events/resets) are ENABLED');
    } else {
      this.logger.log(
        'Competition mode jobs are DISABLED. ' + 'Set COMPETITION_MODE_ENABLED=true to enable.',
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Existing schedule management
  // ──────────────────────────────────────────────────────────────────

  /**
   * Preference cache for notification jobs (#385).
   * Avoids repeated lookups during batch processing.
   */
  private readonly notificationPrefsCache = new Map<string, boolean>();

  private loadSchedules(): void {
    const entries: Array<{ name: string; key: string }> = [
      { name: 'cleanup', key: 'CRON_CLEANUP_SCHEDULE' },
      { name: 'analytics', key: 'CRON_ANALYTICS_SCHEDULE' },
      { name: 'notifications', key: 'CRON_NOTIFICATIONS_SCHEDULE' },
      // #394: Replay schedule for periodic event replay
      { name: 'contract_replay', key: 'CRON_CONTRACT_REPLAY_SCHEDULE' },
      // #competition: Schedule for polling time-boxed competitions that need to end/reset
      { name: 'competition_reset', key: 'CRON_COMPETITION_RESET_SCHEDULE' },
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

    const validations: Array<{ field: string; value: string; min: number; max: number }> = [
      { field: 'minute', value: cronFields.minute, min: 0, max: 59 },
      { field: 'hour', value: cronFields.hour, min: 0, max: 23 },
      { field: 'day-of-month', value: cronFields.dayOfMonth, min: 1, max: 31 },
      { field: 'month', value: cronFields.month, min: 1, max: 12 },
      { field: 'day-of-week', value: cronFields.dayOfWeek, min: 0, max: 7 },
    ];

    const cronFieldValidator = /^(\*|(\*\/)?\d+|\d+(-\d+)?)(,\d+(-\d+)?)*$/;

    for (const v of validations) {
      if (v.value === '*' || v.value.startsWith('*/')) {
        const numPart = v.value.startsWith('*/') ? v.value.slice(2) : '0';
        if (!/^\d+$/.test(numPart)) {
          return this.invalidResult(trimmed, name, `${v.field}: invalid step value "${v.value}"`);
        }
        continue;
      }

      const parts = v.value.split(',');
      for (const part of parts) {
        if (!cronFieldValidator.test(part)) {
          return this.invalidResult(trimmed, name, `${v.field}: invalid field "${v.value}"`);
        }
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

  getAllSchedules(): CronSchedule[] {
    return Array.from(this.schedules.values());
  }

  getSchedule(name: string): CronSchedule | undefined {
    return this.schedules.get(name);
  }

  // ──────────────────────────────────────────────────────────────────
  // #385: Notification preference verification for job processing
  // ──────────────────────────────────────────────────────────────────

  /**
   * Checks whether a user has enabled notification delivery.
   * Uses a simple cache to avoid repeated lookups during batch processing.
   *
   * Returns true when the user has not explicitly disabled notifications,
   * ensuring silent notification loss is prevented.
   */
  shouldSendNotification(userId: string, channel: string): boolean {
    const cacheKey = `${userId}:${channel}`;
    if (this.notificationPrefsCache.has(cacheKey)) {
      return this.notificationPrefsCache.get(cacheKey)!;
    }

    // Default to enabled when no explicit preference is stored.
    // In production this would query a UserPreferences table.
    const enabled = true;
    this.notificationPrefsCache.set(cacheKey, enabled);
    return enabled;
  }

  /**
   * Invalidates the notification preference cache for a user.
   * Called when user preferences are updated.
   */
  clearNotificationPrefsCache(userId?: string): void {
    if (userId) {
      for (const key of this.notificationPrefsCache.keys()) {
        if (key.startsWith(`${userId}:`)) {
          this.notificationPrefsCache.delete(key);
        }
      }
    } else {
      this.notificationPrefsCache.clear();
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // #394: Event replay job support
  // ──────────────────────────────────────────────────────────────────

  /**
   * Records a replay job execution result for audit trail.
   */
  recordReplayJob(result: ReplayJobResult): void {
    this.replayJobHistory.push(result);
    this.logger.log(
      `Replay job recorded: ${result.jobId} (${result.status}) — ${result.eventsProcessed} events in ${result.durationMs}ms`,
    );

    // Limit history size
    if (this.replayJobHistory.length > 1000) {
      this.replayJobHistory.splice(0, this.replayJobHistory.length - 1000);
    }
  }

  /**
   * Returns replay job execution history.
   */
  getReplayJobHistory(limit?: number): ReplayJobResult[] {
    const history = [...this.replayJobHistory];
    history.sort((a, b) => b.executedAt.getTime() - a.executedAt.getTime());
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Checks whether the contract replay feature is enabled.
   */
  isReplayEnabled(): boolean {
    return isFeatureEnabled(this.configService.get<string>('CONTRACT_EVENT_REPLAY_ENABLED'));
  }

  /**
   * Checks whether contract ingestion is enabled.
   */
  isIngestionEnabled(): boolean {
    return isFeatureEnabled(this.configService.get<string>('CONTRACT_INGESTION_ENABLED'));
  }

  // ──────────────────────────────────────────────────────────────────
  // Competition lifecycle scheduling — time-boxed events & resets
  // ──────────────────────────────────────────────────────────────────

  /** Competitions currently tracked for automatic lifecycle transitions. */
  private readonly trackedCompetitions = new Map<string, TrackedCompetition>();

  /** History of competition resets performed by this job runner. */
  private readonly competitionResetLog: CompetitionResetLogEntry[] = [];

  isCompetitionModeEnabled(): boolean {
    return isFeatureEnabled(this.configService.get<string>('COMPETITION_MODE_ENABLED'));
  }

  /**
   * Registers a time-boxed competition so its end can be detected by the
   * `competition_reset` cron tick. Call this right after creating a
   * competition (e.g. from LeaderboardService.createCompetition).
   */
  registerCompetitionLifecycle(competitionId: string, endsAt: Date): void {
    this.trackedCompetitions.set(competitionId, { competitionId, endsAt });
    this.logger.log(
      `Tracking competition ${competitionId} for lifecycle transition at ${endsAt.toISOString()}`,
    );
  }

  /** Stops tracking a competition (e.g. it was cancelled before ending). */
  unregisterCompetitionLifecycle(competitionId: string): boolean {
    return this.trackedCompetitions.delete(competitionId);
  }

  /**
   * Returns competitions whose time-box has elapsed and that haven't yet
   * been flagged for reset. Intended to be polled on the
   * CRON_COMPETITION_RESET_SCHEDULE cadence; the caller is responsible for
   * actually resetting the competition's leaderboard (e.g. via
   * LeaderboardService.resetCompetition) and then calling
   * recordCompetitionReset() to close the loop.
   */
  getCompetitionsDueForReset(): string[] {
    const now = new Date();
    const due: string[] = [];
    for (const tracked of this.trackedCompetitions.values()) {
      if (tracked.endsAt <= now && !tracked.resetScheduledAt) {
        tracked.resetScheduledAt = now;
        due.push(tracked.competitionId);
      }
    }
    return due;
  }

  /**
   * Records that a tracked competition was reset, then stops tracking it.
   */
  recordCompetitionReset(
    competitionId: string,
    reason: 'time-boxed-end' | 'manual' = 'time-boxed-end',
  ): void {
    this.competitionResetLog.push({ competitionId, resetAt: new Date(), reason });
    this.trackedCompetitions.delete(competitionId);
    this.logger.log(`Competition ${competitionId} reset recorded (${reason})`);

    if (this.competitionResetLog.length > 1000) {
      this.competitionResetLog.splice(0, this.competitionResetLog.length - 1000);
    }
  }

  getCompetitionResetLog(limit?: number): CompetitionResetLogEntry[] {
    const log = [...this.competitionResetLog].sort(
      (a, b) => b.resetAt.getTime() - a.resetAt.getTime(),
    );
    return limit ? log.slice(0, limit) : log;
  }

  // ── Private helpers ──────────────────────────────────────────────

  private invalidResult(expression: string, name: string, error: string): CronSchedule {
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
  private readonly pendingWebhookRetries = new Map<
    string,
    {
      webhookId: string;
      attempt: number;
      nextRetryAt: Date;
      lastError?: string;
    }
  >();

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

  // ---------------------------------------------------------------------------
  // Readiness probes — Issue #376
  // ---------------------------------------------------------------------------

  private workerReady = true;
  private lastHeartbeat: Date = new Date();

  /**
   * Returns true when background workers are initialized and accepting jobs.
   * Used by the readiness probe to determine if this instance is traffic-ready.
   */
  isReady(): boolean {
    // Workers are considered ready if initialized and heartbeat is fresh
    // (within the last 60 seconds).
    const heartbeatFresh =
      Date.now() - this.lastHeartbeat.getTime() < 60_000;
    return this.workerReady && heartbeatFresh;
  }

  /**
   * Returns the current depth of pending/scheduled job queues.
   */
  getQueueDepth(): number {
    return this.pendingWebhookRetries.size;
  }

  /**
   * Returns the timestamp of the last worker heartbeat.
   */
  getLastHeartbeat(): Date {
    return this.lastHeartbeat;
  }

  /**
   * Call this periodically from the worker loop to signal aliveness.
   */
  heartbeat(): void {
    this.lastHeartbeat = new Date();
  }
}
