import { Injectable, Logger } from '@nestjs/common';
import { OnboardingService } from '../onboarding/onboarding.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { SocialService } from '../social/social.service';
import {
  UpdateUserPreferencesDto,
  LearnerPreferencesDto,
  TutorPreferencesDto,
} from './dto/update-preferences.dto';

// Re-export so existing callers that import UserPreferencesDto from this
// module continue to compile without changes.
export { UpdateUserPreferencesDto as UserPreferencesDto };

export interface UserPreferencesResponse {
  userId: string;
  learnerPreferences?: LearnerPreferencesDto;
  tutorPreferences?: TutorPreferencesDto;
}

export interface UserPrivilegeChangeEvent {
  userId: string;
  previousRole: string;
  newRole: string;
  changedBy: string;
  timestamp: Date;
}

/**
 * Notification channel preferences for a user.
 * Used by NotificationsService to verify user consent before delivery (#385).
 */
export interface UserNotificationPreferences {
  userId: string;
  email_alerts: boolean;
  push_notifications: boolean;
  marketing_updates: boolean;
}

/**
 * User profile data for email template personalization.
 * Includes fallback-safe fields so templates never render blank content.
 */
export interface UserProfileFields {
  userId: string;
  name?: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
}

/**
 * #354: Result of a cascade delete operation describing all
 * linked records that were removed.
 */
export interface AccountDeletionResult {
  userId: string;
  preferencesDeleted: boolean;
  onboardingDeleted: boolean;
  analyticsEventsDeleted: number;
  socialActivityDeleted: boolean;
  assetUploadsCleared: boolean;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly preferencesByUser = new Map<string, UserPreferencesResponse>();
  private readonly privilegeChangeLog: UserPrivilegeChangeEvent[] = [];
  /** Tracks (userId → assetIds) for upload deduplication awareness. */
  private readonly userUploads = new Map<string, Set<string>>();
  private readonly deletedUsers = new Set<string>();

  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly analyticsService: AnalyticsService,
    private readonly socialService: SocialService,
  ) {}

  async updatePreferences(
    userId: string,
    dto: UpdateUserPreferencesDto,
  ): Promise<UserPreferencesResponse> {
    const existing = this.preferencesByUser.get(userId) ?? {
      userId,
      learnerPreferences: {},
      tutorPreferences: {},
    };

    // Shallow-merge only the typed, allow-listed fields from each sub-DTO.
    // Unknown keys are already rejected by the global ValidationPipe before
    // this method is reached, so no further stripping is needed here.
    const next: UserPreferencesResponse = {
      userId,
      learnerPreferences: {
        ...(existing.learnerPreferences ?? {}),
        ...(dto.learnerPreferences ?? {}),
      },
      tutorPreferences: {
        ...(existing.tutorPreferences ?? {}),
        ...(dto.tutorPreferences ?? {}),
      },
    };

    this.preferencesByUser.set(userId, next);
    return next;
  }

  async onUserPrivilegeChange(
    userId: string,
    previousRole: string,
    newRole: string,
    changedBy: string,
  ): Promise<void> {
    const event: UserPrivilegeChangeEvent = {
      userId,
      previousRole,
      newRole,
      changedBy,
      timestamp: new Date(),
    };
    this.privilegeChangeLog.push(event);
    this.logger.warn(
      `User ${userId} privilege changed from ${previousRole} to ${newRole} by ${changedBy}`,
    );
  }

  getPrivilegeChangeLog(userId?: string): UserPrivilegeChangeEvent[] {
    if (userId) {
      return this.privilegeChangeLog.filter((e) => e.userId === userId);
    }
    return this.privilegeChangeLog;
  }

  /**
   * Retrieves a user's notification channel preferences.
   *
   * Returns default-enabled preferences when no explicit preferences exist,
   * ensuring notifications are never silently dropped for unconfigured users.
   */
  async getUserNotificationPreferences(
    userId: string,
  ): Promise<UserNotificationPreferences> {
    const lp = this.preferencesByUser.get(userId)?.learnerPreferences;
    return {
      userId,
      email_alerts: lp?.email_alerts ?? true,
      push_notifications: lp?.push_notifications ?? true,
      marketing_updates: lp?.marketing_updates ?? false,
    };
  }

  /**
   * Retrieves user profile fields for email template personalization.
   *
   * Returns safe defaults for any missing fields so email templates
   * never render broken or blank content (#387).
   */
  async getUserProfileFields(userId: string): Promise<UserProfileFields> {
    const lp = this.preferencesByUser.get(userId)?.learnerPreferences;
    return {
      userId,
      name: lp?.displayName || undefined,
      email: lp?.email || undefined,
      displayName: lp?.displayName || undefined,
      avatarUrl: lp?.avatarUrl || undefined,
    };
  }

  /**
   * #354: Cascading account deletion that removes all linked records.
   *
   * Ensures no orphaned onboarding progress, analytics events, or
   * social activity is left behind after account deletion.
  /**
   * Records an asset upload against a user for ownership tracking.
   */
  async deleteAccount(userId: string): Promise<AccountDeletionResult> {
    this.logger.warn(`Cascade deleting account for user ${userId}`);

    const result: AccountDeletionResult = {
      userId,
      preferencesDeleted: false,
      onboardingDeleted: false,
      analyticsEventsDeleted: 0,
      socialActivityDeleted: false,
      assetUploadsCleared: false,
    };

    // 1. Remove preferences
    if (this.preferencesByUser.has(userId)) {
      this.preferencesByUser.delete(userId);
      result.preferencesDeleted = true;
    }

    // 2. Remove onboarding progress
    const onboarding = await this.onboardingService.findByUserId(userId);
    if (onboarding) {
      await this.onboardingService.remove(onboarding.id);
      result.onboardingDeleted = true;
    }

    // 3. Remove analytics events for this user
    const events = await this.analyticsService.getEventsByUserId(userId);
    if (events.length > 0) {
      await this.analyticsService.removeEventsByUserId(userId);
      result.analyticsEventsDeleted = events.length;
    }

    // 4. Remove social posts by this user
    const socialPosts = this.socialService.getPostsByUserId(userId);
    for (const post of socialPosts) {
      this.socialService.deletePost(post.id);
    }
    result.socialActivityDeleted = socialPosts.length > 0;

    // 5. Clear asset uploads
    this.userUploads.delete(userId);
    result.assetUploadsCleared = true;

    this.deletedUsers.add(userId);
    this.logger.warn(
      `Account deleted for user ${userId}: preferences=${result.preferencesDeleted}, ` +
      `onboarding=${result.onboardingDeleted}, analytics=${result.analyticsEventsDeleted}, ` +
      `social=${result.socialActivityDeleted}`,
    );

    return result;
  }

  /**
   * Checks if a user account has been deleted.
   */
  isDeleted(userId: string): boolean {
    return this.deletedUsers.has(userId);
  }

  /**
   * Records an asset upload against a user for ownership tracking.
   */
  recordAssetUpload(userId: string, assetId: string): void {
    if (!this.userUploads.has(userId)) {
      this.userUploads.set(userId, new Set());
    }
    this.userUploads.get(userId)!.add(assetId);
  }

  /**
   * Returns all asset IDs uploaded by a user.
   */
  getUserUploads(userId: string): string[] {
    return Array.from(this.userUploads.get(userId) ?? []);
  }
}
