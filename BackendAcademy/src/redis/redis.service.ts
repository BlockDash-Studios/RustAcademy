import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';

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

/**
 * Recognised content resource types for cache invalidation (Issue #379).
 */
export type ContentResource = 'course' | 'lesson';

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly snapshots = new Map<string, UserSnapshot>();
  private readonly cache = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly sets = new Map<string, Set<string>>();
  private readonly DEFAULT_TTL_MS = 5 * 60 * 1000;
  private readonly SNAPSHOT_TTL_MS = 2 * 60 * 1000;

  /**
   * Content-key prefixes indexed by resource type. These are the cache-key
   * namespaces we know can become stale when a course / lesson changes.
   */
  private static readonly CONTENT_KEY_PREFIXES: Record<ContentResource, string[]> = {
    course: ['course:', 'courses:', 'course-summary:', 'course-rating:', 'course-progress:'],
    lesson: ['lesson:', 'lessons:', 'lesson-progress:'],
  };

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
    this.sets.delete(key);
  }

  async sadd(key: string, value: string): Promise<void> {
    const members = this.sets.get(key) ?? new Set<string>();
    members.add(value);
    this.sets.set(key, members);
  }

  async smembers(key: string): Promise<string[]> {
    return Array.from(this.sets.get(key) ?? []);
  }

  async srem(key: string, value: string): Promise<void> {
    this.sets.get(key)?.delete(value);
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
  }

  // ---------------------------------------------------------------------------
  // Health check — Issue #375
  // ---------------------------------------------------------------------------

  /**
   * Returns true when the Redis service reports healthy (cache is accessible).
   * A no-op get is sufficient to validate connectivity and measure latency.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.get('__health_check__');
      return true;
    } catch {
      return false;
    }
  }

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

  // ---------------------------------------------------------------------------
  // Content-edit cache invalidation — Issue #379
  // ---------------------------------------------------------------------------

  /**
   * Invalidates every cache entry that is derived from a given content
   * resource (course or lesson). Solves the bug where editing a course or
   * lesson left stale values in cache, causing clients to see inconsistent
   * responses after content updates.
   *
   * Returns the number of keys removed — useful for diagnostics / tests.
   */
  async invalidateContentCache(resource: ContentResource, id: string): Promise<number> {
    if (!id) return 0;
    const prefixes = RedisService.CONTENT_KEY_PREFIXES[resource] ?? [];
    let removed = 0;
    for (const [key] of this.cache) {
      if (this.matchesAnyPrefix(key, prefixes, id)) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.debug(
        `[#379] invalidated ${removed} cache key(s) for ${resource}:${id}`,
      );
    }
    return removed;
  }

  /**
   * Predicate helper: does the given cache key start with one of the
   * recognised prefixes AND embed the resource id?
   */
  private matchesAnyPrefix(key: string, prefixes: string[], id: string): boolean {
    return prefixes.some((prefix) => key.startsWith(prefix) && key.includes(id));
  }

  onApplicationShutdown(signal?: string) {
    this.cache.clear();
    this.snapshots.clear();
    this.logger.log(`RedisService shut down gracefully (signal: ${signal}).`);
  }
}
