import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  Badge,
  BadgeListResponse,
  UserBadge,
  UserBadgesResponse,
} from './interfaces/badges.interfaces';

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

@Injectable()
export class BadgesService {
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
    // In a real app, we would check if user exists in the User service.
    // For this in-memory implementation, we'll assume any userId is valid 
    // but return an empty list if they have no badges.
    const badges = userBadgesStore.get(userId) ?? [];
    return {
      userId,
      badges,
    };
  }

  /**
   * Awards a badge to a user.
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

    const currentBadges = userBadgesStore.get(userId) ?? [];

    // Prevent duplicate awards
    if (currentBadges.some((ub) => ub.badge.id === badgeId)) {
      return this.getUserBadges(userId);
    }

    const newUserBadge: UserBadge = {
      badge,
      awardedAt: new Date().toISOString(),
      nftTokenId,
    };

    userBadgesStore.set(userId, [...currentBadges, newUserBadge]);

    return this.getUserBadges(userId);
  }

  /**
   * Resets a user's badges (useful for testing).
   */
  resetUserBadges(userId: string): void {
    userBadgesStore.delete(userId);
  }

  /**
   * Clears all in-memory badge data (useful for testing isolation).
   */
  clearAll(): void {
    userBadgesStore.clear();
  }
}
