import { Injectable, Logger } from '@nestjs/common';

export interface UserSnapshot {
  userId: string;
  lastInteractionAt: Date;
  interactionCount: number;
  eventTypes: string[];
  recentCourses: string[];
  recentChallenges: string[];
  preferences: Record<string, unknown>;
  cachedAt: Date;
}

export interface RecommendationExplainability {
  factors: string[];
  confidence: number;
  userSignalAge: number;
  signalsUsed: string[];
  modelVersion: string;
}

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private readonly snapshots = new Map<string, UserSnapshot>();
  private readonly cache = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly DEFAULT_TTL_MS = 5 * 60 * 1000;
  private readonly SNAPSHOT_TTL_MS = 2 * 60 * 1000;

  async getUserSnapshot(userId: string): Promise<UserSnapshot | null> {
    const snapshot = this.snapshots.get(userId);
    if (!snapshot) return null;
    if (Date.now() - snapshot.cachedAt.getTime() > this.SNAPSHOT_TTL_MS) {
      this.snapshots.delete(userId);
      return null;
    }
    return snapshot;
  }

  async setUserSnapshot(userId: string, data: Omit<UserSnapshot, 'cachedAt'>): Promise<void> {
    this.snapshots.set(userId, { ...data, cachedAt: new Date() });
  }

  async invalidateUserSnapshot(userId: string): Promise<void> {
    this.snapshots.delete(userId);
  }

  async refreshUserSnapshot(
    userId: string,
    interactionData: Partial<UserSnapshot>,
  ): Promise<UserSnapshot> {
    const existing = await this.getUserSnapshot(userId);
    if (!existing) {
      const snapshot: UserSnapshot = {
        userId,
        lastInteractionAt: interactionData.lastInteractionAt || new Date(),
        interactionCount: interactionData.interactionCount || 1,
        eventTypes: interactionData.eventTypes || [],
        recentCourses: interactionData.recentCourses || [],
        recentChallenges: interactionData.recentChallenges || [],
        preferences: interactionData.preferences || {},
        cachedAt: new Date(),
      };
      this.snapshots.set(userId, snapshot);
      return snapshot;
    }
    const updated: UserSnapshot = {
      ...existing,
      lastInteractionAt: interactionData.lastInteractionAt || existing.lastInteractionAt,
      interactionCount: existing.interactionCount + (interactionData.interactionCount || 1),
      eventTypes: [...new Set([...existing.eventTypes, ...(interactionData.eventTypes || [])])],
      recentCourses: interactionData.recentCourses || existing.recentCourses,
      recentChallenges: interactionData.recentChallenges || existing.recentChallenges,
      preferences: { ...existing.preferences, ...(interactionData.preferences || {}) },
      cachedAt: new Date(),
    };
    this.snapshots.set(userId, updated);
    return updated;
  }

  async getRecommendationExplainability(userId: string): Promise<RecommendationExplainability | null> {
    const snapshot = await this.getUserSnapshot(userId);
    if (!snapshot) return null;
    const signalAge = Date.now() - snapshot.lastInteractionAt.getTime();
    const factors: string[] = [];
    if (snapshot.interactionCount > 10) factors.push('high_engagement');
    if (snapshot.interactionCount > 0 && snapshot.interactionCount <= 10) factors.push('moderate_engagement');
    if (snapshot.eventTypes.includes('challenge_completed')) factors.push('challenge_completion_history');
    if (snapshot.eventTypes.includes('course_enrolled')) factors.push('course_enrollment_history');
    if (snapshot.recentCourses.length > 0) factors.push('recent_course_activity');
    return {
      factors,
      confidence: snapshot.interactionCount > 20 ? 0.85 : snapshot.interactionCount > 5 ? 0.65 : 0.4,
      userSignalAge: signalAge,
      signalsUsed: snapshot.eventTypes,
      modelVersion: 'rustacademy-recommender-v2',
    };
  }

  async get(key: string): Promise<unknown | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.DEFAULT_TTL_MS),
    });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async getKeys(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace('*', '.*'));
    return Array.from(this.cache.keys()).filter((k) => regex.test(k));
  }

  // ---------------------------------------------------------------------------
  // Webhook Idempotency — Issue #411
  // ---------------------------------------------------------------------------

  private readonly webhookIdempotency = new Map<string, number>();

  /**
   * Returns true if this idempotency key was already seen within the TTL window.
   */
  async isWebhookIdempotent(idempotencyKey: string, ttlMs = 3_600_000): Promise<boolean> {
    const now = Date.now();
    const firstSeen = this.webhookIdempotency.get(idempotencyKey);
    if (firstSeen && now - firstSeen < ttlMs) {
      return true;
    }
    this.webhookIdempotency.set(idempotencyKey, now);
    return false;
  }

  /**
   * Records a webhook delivery attempt for tracking.
   */
  private readonly webhookDeliveryLog = new Map<string, Array<{
    attempt: number;
    timestamp: Date;
    status: string;
    statusCode?: number;
  }>>();

  async recordWebhookDelivery(
    webhookId: string,
    attempt: number,
    status: string,
    statusCode?: number,
  ): Promise<void> {
    const log = this.webhookDeliveryLog.get(webhookId) || [];
    log.push({ attempt, timestamp: new Date(), status, statusCode });
    this.webhookDeliveryLog.set(webhookId, log);
  }

  async getWebhookDeliveryLog(webhookId: string): Promise<Array<{
    attempt: number;
    timestamp: Date;
    status: string;
    statusCode?: number;
  }>> {
    return this.webhookDeliveryLog.get(webhookId) || [];
  async warmCache(keys: string[], fetchFn: (key: string) => Promise<unknown>, ttlMs?: number): Promise<number> {
    let warmed = 0;
    for (const key of keys) {
      const existing = this.cache.get(key);
      if (existing && Date.now() < existing.expiresAt) continue;
      try {
        const value = await fetchFn(key);
        await this.set(key, value, ttlMs);
        warmed++;
      } catch {
        this.logger.warn(`Cache warming failed for key: ${key}`);
      }
    }
    return warmed;
  }

  async getCacheStats(): Promise<{ totalKeys: number; expiredKeys: number }> {
    let expiredKeys = 0;
    for (const [key, entry] of this.cache) {
      if (Date.now() > entry.expiresAt) expiredKeys++;
    }
    return { totalKeys: this.cache.size, expiredKeys };
  }
}
