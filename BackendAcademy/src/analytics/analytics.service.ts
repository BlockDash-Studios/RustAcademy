import { Injectable, BadRequestException } from '@nestjs/common';
import { AnalyticsEvent } from './analytics.entity';
import { RedisService } from '../redis/redis.service';
import { v4 as uuidv4 } from 'uuid';
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
  /** Emitted when a batch of low-priority notifications is flushed */
  NOTIFICATION_BATCH_FLUSHED = 'notification_batch_flushed',
  /** Emitted when a single notification is delivered */
  NOTIFICATION_DELIVERED = 'notification_delivered',
}

@Injectable()
export class AnalyticsService {
  private readonly events: AnalyticsEvent[] = [];

  constructor(
    private readonly redisService?: RedisService,
    private readonly logger?: CorrelationLoggerService,
  ) {}
  private static readonly VALID_EVENT_TYPES = new Set(Object.values(EventType));

  constructor(private readonly redisService?: RedisService) {}

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

  async trackEvent(event: Partial<AnalyticsEvent>): Promise<AnalyticsEvent> {
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

      await this.redisService.refreshUserSnapshot(analyticsEvent.userId, interactionData);
    }

    return analyticsEvent;
  }

  async getEventsByUserId(userId: string): Promise<AnalyticsEvent[]> {
    return this.events.filter(event => event.userId === userId);
  }

  async getEventsByType(eventType: string): Promise<AnalyticsEvent[]> {
    return this.events.filter(event => event.eventType === eventType);
  }

  async getEventsByDateRange(startDate: Date, endDate: Date): Promise<AnalyticsEvent[]> {
    return this.events.filter(
      event => event.timestamp >= startDate && event.timestamp <= endDate,
    );
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
    const index = this.events.findIndex(event => event.id === id);
    if (index === -1) return false;
    this.events.splice(index, 1);
    return true;
  }

  async clearOldEvents(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const initialLength = this.events.length;
    const filtered = this.events.filter(event => event.timestamp >= cutoffDate);
    this.events.length = 0;
    this.events.push(...filtered);

    return initialLength - this.events.length;
  }
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
