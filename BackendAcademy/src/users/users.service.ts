import { Injectable, Logger } from '@nestjs/common';

export interface UserPreferencesDto {
  learnerPreferences?: Record<string, unknown>;
  tutorPreferences?: Record<string, unknown>;
}

export interface UserPreferencesResponse {
  userId: string;
  learnerPreferences?: Record<string, unknown>;
  tutorPreferences?: Record<string, unknown>;
}

export interface UserPrivilegeChangeEvent {
  userId: string;
  previousRole: string;
  newRole: string;
  changedBy: string;
  timestamp: Date;
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

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly preferencesByUser = new Map<string, UserPreferencesResponse>();
  private readonly privilegeChangeLog: UserPrivilegeChangeEvent[] = [];
  /** Tracks (userId → assetIds) for upload deduplication awareness. */
  private readonly userUploads = new Map<string, Set<string>>();

  async updatePreferences(
    userId: string,
    dto: UserPreferencesDto,
  ): Promise<UserPreferencesResponse> {
    const existing = this.preferencesByUser.get(userId) || {
      userId,
      learnerPreferences: {},
      tutorPreferences: {},
    };

    const next = {
      ...existing,
      ...dto,
      learnerPreferences: {
        ...(existing.learnerPreferences || {}),
        ...(dto.learnerPreferences || {}),
      },
      tutorPreferences: {
        ...(existing.tutorPreferences || {}),
        ...(dto.tutorPreferences || {}),
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
   * Retrieves user profile fields for email template personalization.
   *
   * Returns safe defaults for any missing fields so email templates
   * never render broken or blank content (#387).
   */
  async getUserProfileFields(userId: string): Promise<UserProfileFields> {
    const prefs = this.preferencesByUser.get(userId);
    return {
      userId,
      name: (prefs?.learnerPreferences?.['displayName'] as string) || undefined,
      email: (prefs?.learnerPreferences?.['email'] as string) || undefined,
      displayName:
        (prefs?.learnerPreferences?.['displayName'] as string) || undefined,
      avatarUrl:
        (prefs?.learnerPreferences?.['avatarUrl'] as string) || undefined,
    };
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
