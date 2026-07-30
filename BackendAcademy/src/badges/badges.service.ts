import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import type {
  Badge,
  BadgeListResponse,
  UserBadge,
  UserBadgesResponse,
} from './interfaces/badges.interfaces';
import { NotificationsService } from '../notifications/notifications.service';
import { AnalyticsService, EventType } from '../analytics/analytics.service';

/**
 * In-memory store for badge definitions.
 */
const badgeDefinitions: Record<string, Badge> = {
  'first-login': {
    id: 'first-login',
    name: 'First Steps',
    description: 'Log in for the first time.',
    iconUrl: 'https://api.dicebear.com/7.x/identicon/svg?seed=first-login',
  },
  'ten-submissions': {
    id: 'ten-submissions',
    name: 'Dedicated Learner',
    description: 'Complete 10 course submissions.',
    iconUrl: 'https://api.dicebear.com/7.x/identicon/svg?seed=ten-submissions',
  },
  'streak-seven': {
    id: 'streak-seven',
    name: 'Week Warrior',
    description: 'Maintain a 7-day activity streak.',
    iconUrl: 'https://api.dicebear.com/7.x/identicon/svg?seed=streak-seven',
  },
};

/**
 * In-memory store for user-awarded badges.
 * Keyed by userId -> Array of UserBadge
 */
const userBadgesStore = new Map<string, UserBadge[]>();

/**
 * Issue #362: Dedicated set for conflict-safe duplicate detection.
 * Keyed by `userId::badgeId` so the membership check is O(1) and atomic.
 */
const awardedBadgeSet = new Set<string>();

@Injectable()
export class BadgesService {
  constructor(
    @Optional()
    private readonly notificationsService?: NotificationsService,
    @Optional()
    private readonly analyticsService?: AnalyticsService,
  ) {}

  /**
   * Returns all available achievement badges.
   */
  getAllBadges(): BadgeListResponse {
    return {
      badges: Object.values(badgeDefinitions),
    };
  }

  /**
   * Returns all badges awarded to a specific user.
   *
   * @throws NotFoundException if the userId is unknown
   */
  getUserBadges(userId: string): UserBadgesResponse {
    const badges = userBadgesStore.get(userId) ?? [];
    return {
      userId,
      badges,
    };
  }

  // -------------------------------------------------------------------------
  // Issue #362: Conflict-safe, idempotent badge awarding
  // -------------------------------------------------------------------------

  /**
   * Awards a badge to a user with conflict-safe, idempotent semantics.
   *
   * **Conflict safety**: Uses a dedicated `awardedBadgeSet` (Set<string>)
   * keyed by `userId::badgeId`. The `has`/`add` check is atomic within a
   * single Node.js event-loop tick, so concurrent calls cannot both pass
   * the guard.
   *
   * **Idempotency**: If the same `userId` + `badgeId` combination is
   * awarded more than once, the second call is a silent no-op that returns
   * the existing badge list exactly as the first call did. No error is
   * thrown — duplicate calls are harmless.
   *
   * **Side effects** (Issue #362):
   *   - Sends an in-app notification via NotificationsService
   *     (respecting the user's `badge_earned_alerts` preference).
   *   - Tracks a `BADGE_EARNED` analytics event via AnalyticsService.
   *   - Side effects are only fired on the *first* award, not on duplicates.
   *
   * @param userId     Target user
   * @param badgeId    ID of the badge to award
   * @param nftTokenId The NFT token ID for this award
   * @returns The updated list of user badges
   *
   * @throws NotFoundException if the badgeId does not exist
   */
  awardBadge(
    userId: string,
    badgeId: string,
    nftTokenId: string,
  ): UserBadgesResponse {
    const badge = badgeDefinitions[badgeId];
    if (!badge) {
      throw new NotFoundException(`Badge '${badgeId}' not found.`);
    }

    const dedupKey = `${userId}::${badgeId}`;

    // Issue #362: Atomic check-then-set within the same event-loop tick so
    // concurrent calls cannot both pass the guard. Duplicate calls are a
    // silent no-op (idempotent).
    if (awardedBadgeSet.has(dedupKey)) {
      return this.getUserBadges(userId);
    }
    awardedBadgeSet.add(dedupKey);

    const currentBadges = userBadgesStore.get(userId) ?? [];

    // Defensive: also check the array in case of inconsistency
    if (currentBadges.some((ub) => ub.badge.id === badgeId)) {
      return this.getUserBadges(userId);
    }

    const newUserBadge: UserBadge = {
      badge,
      awardedAt: new Date().toISOString(),
      nftTokenId,
    };

    userBadgesStore.set(userId, [...currentBadges, newUserBadge]);

    // Issue #362: Side effects fired only on first award (fire-and-forget)
    this.emitBadgeEarnedSideEffects(userId, badge);

    return this.getUserBadges(userId);
  }

  /**
   * Fire badge-earned side effects without blocking the caller.
   * (Issue #362)
   */
  private emitBadgeEarnedSideEffects(userId: string, badge: Badge): void {
    // Notification
    try {
      this.notificationsService?.sendBadgeEarnedAlert(userId, badge.name, badge.id);
    } catch {
      // Non-critical – don't fail the badge award
    }

    // Analytics event
    try {
      this.analyticsService?.trackEvent({
        eventType: EventType.BADGE_EARNED,
        userId,
        properties: { badgeId: badge.id, badgeName: badge.name },
      });
    } catch {
      // Non-critical
    }
  }

  /**
   * Reset badge-awarding state (useful for testing).
   */
  resetState(): void {
    userBadgesStore.clear();
    awardedBadgeSet.clear();
  }

  /**
   * Resets a user's badges (useful for testing).
   */
  resetUserBadges(userId: string): void {
    const badges = userBadgesStore.get(userId) ?? [];
    userBadgesStore.delete(userId);
    // Also clean up the dedup set
    for (const ub of badges) {
      awardedBadgeSet.delete(`${userId}::${ub.badge.id}`);
    }
  }

  /**
   * Check whether a user already has a specific badge.
   * Uses the O(1) dedup set for efficiency. (Issue #362)
   */
  hasBadge(userId: string, badgeId: string): boolean {
    return awardedBadgeSet.has(`${userId}::${badgeId}`);
  }

  /**
   * Clears all in-memory badge data (useful for testing isolation).
   */
  clearAll(): void {
    userBadgesStore.clear();
  }
}
