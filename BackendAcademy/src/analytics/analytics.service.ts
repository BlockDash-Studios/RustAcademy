import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { AnalyticsEvent } from './analytics.entity';
import { RedisService } from '../redis/redis.service';
import { v4 as uuidv4 } from 'uuid';
import { StateReconciliationResult } from '../contracts/interfaces/contracts.interface';
import {
  TransactionManagerService,
  TransactionSnapshot,
} from '../common/transaction-manager.service';
import { CorrelationLoggerService } from '../logging/logger.service';

export enum EventType {
  USER_REGISTERED = 'user_registered',
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  PROFILE_UPDATED = 'profile_updated',
  COURSE_ENROLLED = 'course_enrolled',
  COURSE_COMPLETED = 'course_completed',
  CHALLENGE_STARTED = 'challenge_started',
  CHALLENGE_COMPLETED = 'challenge_completed',
  CHALLENGE_SUBMITTED = 'challenge_submitted',
  BADGE_EARNED = 'badge_earned',
  TUTORIAL_STARTED = 'tutorial_started',
  TUTORIAL_COMPLETED = 'tutorial_completed',
  REWARD_CLAIMED = 'reward_claimed',
  LEADERBOARD_VIEWED = 'leaderboard_viewed',
  API_KEY_CREATED = 'api_key_created',
  API_KEY_REVOKED = 'api_key_revoked',
  API_KEY_USED = 'api_key_used',
  API_KEY_ANOMALY = 'api_key_anomaly',
  SESSION_REVOKED = 'session_revoked',
  DEVICE_BOUND = 'device_bound',
  PRIVILEGE_CHANGED = 'privilege_changed',
  // #394: Reconciliation events
  CONTRACT_RECONCILIATION_STARTED = 'contract_reconciliation_started',
  CONTRACT_RECONCILIATION_COMPLETED = 'contract_reconciliation_completed',
  CONTRACT_REPLAY_STARTED = 'contract_replay_started',
  CONTRACT_REPLAY_COMPLETED = 'contract_replay_completed',
  // #386: Notification batching events
  NOTIFICATION_BATCH_FLUSHED = 'notification_batch_flushed',
  NOTIFICATION_DELIVERED = 'notification_delivered',
}

/**
 * Summary of reconciliation activity for analytics.
 */
export interface ReconciliationSummary {
  totalReconciliations: number;
  consistentStateCount: number;
  inconsistentStateCount: number;
  lastReconciliationAt: Date | null;
  totalDiscrepanciesFound: number;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly events: AnalyticsEvent[] = [];

  /** Allow-listed event types used by validateEventPayload(). */
  static readonly VALID_EVENT_TYPES: ReadonlySet<EventType> = new Set(
    Object.values(EventType),
  );

  /** #394: History of reconciliation results for analytics */
  private readonly reconciliationHistory: StateReconciliationResult[] = [];

  constructor(
    private readonly redisService?: RedisService,
    private readonly transactionManager?: TransactionManagerService,
  ) {}

  validateEventPayload(event: Partial<AnalyticsEvent>): void {
    if (!event.eventType) {
      throw new BadRequestException('eventType is required');
    }
    if (!AnalyticsService.VALID_EVENT_TYPES.has(event.eventType as EventType)) {
      throw new BadRequestException(
        `Invalid eventType "${event.eventType}". Must be one of: ${Array.from(AnalyticsService.VALID_EVENT_TYPES).join(', ')}`,
      );
    }
    if (event.properties && typeof event.properties !== 'object') {
      throw new BadRequestException('properties must be an object');
    }
    if (event.userId && typeof event.userId !== 'string') {
      throw new BadRequestException('userId must be a string');
    }
    if (event.sessionId && typeof event.sessionId !== 'string') {
      throw new BadRequestException('sessionId must be a string');
    }
    if (event.ipAddress && typeof event.ipAddress !== 'string') {
      throw new BadRequestException('ipAddress must be a string');
    }
    if (event.userAgent && typeof event.userAgent !== 'string') {
      throw new BadRequestException('userAgent must be a string');
    }
  }

  /**
   * Track an analytics event atomically. The event is first pushed to the
   * in-memory store, then the Redis snapshot is refreshed. If the Redis
   * refresh fails, the event is removed from the store so callers never
   * observe a partial side-effect.
   *
   * When a {@link TransactionManagerService} is available the two
   * mutations are wrapped in a transactional atomic operation with
   * automatic rollback semantics.
   */
  async trackEvent(event: Partial<AnalyticsEvent>): Promise<AnalyticsEvent> {
    if (this.transactionManager) {
      return this.trackEventAtomically(event);
    }
    return this.trackEventLegacy(event);
  }

  /**
   * Atomic variant of trackEvent (#358). Uses the transaction manager
   * to guarantee that the event store and Redis snapshot are always
   * in a consistent state.
   */
  private async trackEventAtomically(event: Partial<AnalyticsEvent>): Promise<AnalyticsEvent> {
    const correlationId = event.properties?.correlationId
      || CorrelationLoggerService.getCorrelationId();

    const analyticsEvent = new AnalyticsEvent({
      ...event,
      id: event.id || uuidv4(),
      timestamp: event.timestamp || new Date(),
      properties: {
        ...event.properties,
        correlationId,
      },
    });

    const txResult = await this.transactionManager!.runAtomic(async (tx) => {
      // Step 1: Push event to in-memory store
      this.events.push(analyticsEvent);

      await tx.addOperation(async (): Promise<TransactionSnapshot> => ({
        restore: () => {
          const idx = this.events.indexOf(analyticsEvent);
          if (idx !== -1) this.events.splice(idx, 1);
        },
        data: { eventId: analyticsEvent.id },
      }));

      this.logger?.log(`Event tracked: ${analyticsEvent.eventType}`, 'AnalyticsService');

      // Step 2: Refresh Redis snapshot (if applicable)
      if (this.redisService && analyticsEvent.userId) {
        const eventTypes = [analyticsEvent.eventType];
        const interactionData: Record<string, any> = {
          lastInteractionAt: new Date(),
          interactionCount: 1,
          eventTypes,
          correlationId,
        };

        if (analyticsEvent.eventType === EventType.COURSE_ENROLLED) {
          interactionData.recentCourses = analyticsEvent.properties?.courseId
            ? [analyticsEvent.properties.courseId]
            : [];
        }
        if (analyticsEvent.eventType === EventType.CHALLENGE_COMPLETED) {
          interactionData.recentChallenges = analyticsEvent.properties?.challengeId
            ? [analyticsEvent.properties.challengeId]
            : [];
        }
        if (
          analyticsEvent.eventType === EventType.CONTRACT_RECONCILIATION_COMPLETED
        ) {
          interactionData.lastReconciliationAt = new Date();
        }

        await this.redisService.refreshUserSnapshot(analyticsEvent.userId, interactionData);
      }

      return analyticsEvent;
    });

    if (!txResult.success) {
      this.logger.error(
        `Failed to track event ${analyticsEvent.eventType}: ${txResult.error?.message}`,
      );
      throw txResult.error;
    }

    return txResult.result!;
  }

  /**
   * Legacy (non-transactional) variant of trackEvent. Used as fallback
   * when no TransactionManagerService is injected.
   */
  private async trackEventLegacy(event: Partial<AnalyticsEvent>): Promise<AnalyticsEvent> {
    const correlationId = event.properties?.correlationId
      || CorrelationLoggerService.getCorrelationId();

    const analyticsEvent = new AnalyticsEvent({
      ...event,
      id: event.id || uuidv4(),
      timestamp: event.timestamp || new Date(),
      properties: {
        ...event.properties,
        correlationId,
      },
    });
    this.events.push(analyticsEvent);

    this.logger?.log(`Event tracked: ${analyticsEvent.eventType}`, 'AnalyticsService');

    if (this.redisService && analyticsEvent.userId) {
      const eventTypes = [analyticsEvent.eventType];
      const interactionData: Record<string, any> = {
        lastInteractionAt: new Date(),
        interactionCount: 1,
        eventTypes,
        correlationId,
      };

      if (analyticsEvent.eventType === EventType.COURSE_ENROLLED) {
        interactionData.recentCourses = analyticsEvent.properties?.courseId
          ? [analyticsEvent.properties.courseId]
          : [];
      }
      if (analyticsEvent.eventType === EventType.CHALLENGE_COMPLETED) {
        interactionData.recentChallenges = analyticsEvent.properties?.challengeId
          ? [analyticsEvent.properties.challengeId]
          : [];
      }
      // #394: Track reconciliation interactions
      if (
        analyticsEvent.eventType === EventType.CONTRACT_RECONCILIATION_COMPLETED
      ) {
        interactionData.lastReconciliationAt = new Date();
      }

      await this.redisService.refreshUserSnapshot(analyticsEvent.userId, interactionData);
    }

    return analyticsEvent;
  }

  async getEventsByUserId(userId: string): Promise<AnalyticsEvent[]> {
    return this.events.filter((event) => event.userId === userId);
  }

  async getEventsByType(eventType: string): Promise<AnalyticsEvent[]> {
    return this.events.filter((event) => event.eventType === eventType);
  }

  async getEventsByDateRange(startDate: Date, endDate: Date): Promise<AnalyticsEvent[]> {
    return this.events.filter(
      (event) => event.timestamp >= startDate && event.timestamp <= endDate,
    );
  }

  /**
   * #354: Removes all analytics events for a given user.
   */
  async removeEventsByUserId(userId: string): Promise<number> {
    const before = this.events.length;
    this.events.splice(
      0,
      this.events.length,
      ...this.events.filter((e) => e.userId !== userId),
    );
    return before - this.events.length;
  }

  async getEventStatistics(): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    uniqueUsers: number;
  }> {
    const eventsByType: Record<string, number> = {};
    const uniqueUsers = new Set<string>();

    for (const event of this.events) {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
      if (event.userId) {
        uniqueUsers.add(event.userId);
      }
    }

    return {
      totalEvents: this.events.length,
      eventsByType,
      uniqueUsers: uniqueUsers.size,
    };
  }

  async getAllEvents(limit?: number): Promise<AnalyticsEvent[]> {
    if (limit) {
      return this.events.slice(-limit);
    }
    return this.events;
  }

  /**
   * Returns events using cursor-based pagination with stable ordering.
   */
  async getEventsPaginated(options: {
    cursor?: string;
    limit: number;
    userId?: string;
  }): Promise<{ events: AnalyticsEvent[]; nextCursor?: string }> {
    let filtered = [...this.events];
    if (options.userId) {
      filtered = filtered.filter((e) => e.userId === options.userId);
    }

    const sorted = filtered.sort((a, b) => {
      const timeDiff = b.timestamp.getTime() - a.timestamp.getTime();
      if (timeDiff !== 0) return timeDiff;
      return (b.id ?? '').localeCompare(a.id ?? '');
    });

    let startIndex = 0;
    if (options.cursor) {
      const cursorIdx = sorted.findIndex((e) => e.id === options.cursor);
      if (cursorIdx !== -1) startIndex = cursorIdx + 1;
    }

    const events = sorted.slice(startIndex, startIndex + options.limit);
    const nextCursor =
      events.length === options.limit
        ? events[events.length - 1].id
        : undefined;

    return { events, nextCursor };
  }

  async deleteEvent(id: string): Promise<boolean> {
    const index = this.events.findIndex((event) => event.id === id);
    if (index === -1) return false;
    this.events.splice(index, 1);
    return true;
  }

  async clearOldEvents(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const initialLength = this.events.length;
    const filtered = this.events.filter((event) => event.timestamp >= cutoffDate);
    this.events.length = 0;
    this.events.push(...filtered);

    return initialLength - this.events.length;
  }

  // ──────────────────────────────────────────────────────────────────
  // #394: Contract reconciliation tracking
  // ──────────────────────────────────────────────────────────────────

  /**
   * Records a state reconciliation result for analytics tracking.
   */
  recordReconciliation(result: StateReconciliationResult): void {
    this.reconciliationHistory.push(result);
    this.logger.log(
      `Reconciliation recorded for ${result.contractId}: consistent=${result.isConsistent}, discrepancies=${result.discrepancies.length}`,
    );

    // Limit history size
    if (this.reconciliationHistory.length > 1000) {
      this.reconciliationHistory.splice(0, this.reconciliationHistory.length - 1000);
    }
  }

  /**
   * Returns reconciliation history, optionally filtered by contract.
   */
  getReconciliationHistory(contractId?: string): StateReconciliationResult[] {
    const history = [...this.reconciliationHistory];
    history.sort(
      (a, b) => b.reconciledAt.getTime() - a.reconciledAt.getTime(),
    );
    return contractId
      ? history.filter((r) => r.contractId === contractId)
      : history;
  }

  /**
   * Returns a summary of all reconciliation activity.
   */
  getReconciliationSummary(): ReconciliationSummary {
    let consistent = 0;
    let inconsistent = 0;
    let totalDiscrepancies = 0;
    let lastAt: Date | null = null;

    for (const result of this.reconciliationHistory) {
      if (result.isConsistent) {
        consistent++;
      } else {
        inconsistent++;
      }
      totalDiscrepancies += result.discrepancies.length;

      if (!lastAt || result.reconciledAt > lastAt) {
        lastAt = result.reconciledAt;
      }
    }

    return {
      totalReconciliations: this.reconciliationHistory.length,
      consistentStateCount: consistent,
      inconsistentStateCount: inconsistent,
      lastReconciliationAt: lastAt,
      totalDiscrepanciesFound: totalDiscrepancies,
    };
  }

  // ── Notification batching analytics (#386) ────────────────

  /**
   * Tracks a notification batch flush event.
   */
  async trackBatchFlush(
    batchId: string,
    totalCount: number,
    successCount: number,
    failureCount: number,
  ): Promise<void> {
    await this.trackEvent({
      eventType: EventType.NOTIFICATION_BATCH_FLUSHED,
      properties: {
        batchId,
        totalCount,
        successCount,
        failureCount,
      },
    });
  }

  /**
   * Tracks a single notification delivery event.
   */
  async trackNotificationDelivery(
    notificationId: string,
    userId: string,
    providerId: string,
    success: boolean,
  ): Promise<void> {
    await this.trackEvent({
      eventType: EventType.NOTIFICATION_DELIVERED,
      userId,
      properties: {
        notificationId,
        providerId,
        success,
      },
    });
  }
}
