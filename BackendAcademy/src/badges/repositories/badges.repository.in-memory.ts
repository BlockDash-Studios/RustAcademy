import { Badge, UserBadge } from '../interfaces/badges.interfaces';
import { IBadgesRepository } from './badges.repository.interface';

/**
 * In-memory implementation of the badges repository.
 * Stores badge definitions and user-awarded badges in process-local Maps.
 */
export class InMemoryBadgesRepository implements IBadgesRepository {
  private readonly badgeDefinitions: Record<string, Badge> = {
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

  private readonly userBadgesStore = new Map<string, UserBadge[]>();

  getAllBadges(): Badge[] {
    return Object.values(this.badgeDefinitions);
  }

  getBadgeById(badgeId: string): Badge | undefined {
    return this.badgeDefinitions[badgeId];
  }

  getUserBadges(userId: string): UserBadge[] {
    return this.userBadgesStore.get(userId) ?? [];
  }

  awardBadge(userId: string, userBadge: UserBadge): void {
    const currentBadges = this.userBadgesStore.get(userId) ?? [];
    this.userBadgesStore.set(userId, [...currentBadges, userBadge]);
  }

  resetUserBadges(userId: string): void {
    this.userBadgesStore.delete(userId);
  }

  clearAll(): void {
    this.userBadgesStore.clear();
  }
}
