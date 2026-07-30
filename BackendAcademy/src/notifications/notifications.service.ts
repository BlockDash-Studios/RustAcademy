import { Injectable } from '@nestjs/common';
import { Notification } from './interfaces/notifications.interface';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationPreferences } from './interfaces/preferences.interface';
import { UpdateNotificationPreferencesDto } from './dto/update-preferences.dto';

@Injectable()
export class NotificationsService {
  private notifications: Notification[] = [];
  private preferences: Map<string, NotificationPreferences> = new Map();

  create(createNotificationDto: CreateNotificationDto): Notification {
    const newNotification: Notification = {
      id: Math.random().toString(36).substring(2, 9),
      ...createNotificationDto,
      isRead: false,
      createdAt: new Date(),
    };
    this.notifications.push(newNotification);
    return newNotification;
  }

  findAll(): Notification[] {
    return this.notifications;
  }

  findByUserId(userId: string): Notification[] {
    return this.notifications.filter((n) => n.userId === userId);
  }

  // -------------------------------------------------------------------------
  // Issue #360: Grading failure notification
  // -------------------------------------------------------------------------

  /**
   * Sends a grading failure notification to the submission owner when a
   * grading job has permanently failed after exhausting all retry attempts.
   *
   * Respects the user's `grading_failure_alerts` preference.
   *
   * @param userId   Owner of the submission
   * @param jobId    The failed grading job identifier
   * @param error    Last error message from the grader
   */
  sendGradingFailureAlert(userId: string, jobId: string, error: string): void {
    const prefs = this.getPreferences(userId);
    if (!prefs.grading_failure_alerts) return;

    this.create({
      userId,
      type: 'in-app',
      title: 'Grading Failed',
      message: `Your submission grading has permanently failed after multiple retries. Job: ${jobId}. Error: ${error}`,
    });
  }

  // -------------------------------------------------------------------------
  // Issue #362: Badge earned notification
  // -------------------------------------------------------------------------

  /**
   * Sends a badge-earned notification to the user when a new badge is awarded.
   *
   * Respects the user's `badge_earned_alerts` preference.
   *
   * @param userId    The user who earned the badge
   * @param badgeName Human-readable badge name
   * @param badgeId   Badge identifier
   */
  sendBadgeEarnedAlert(userId: string, badgeName: string, badgeId: string): void {
    const prefs = this.getPreferences(userId);
    if (!prefs.badge_earned_alerts) return;

    this.create({
      userId,
      type: 'in-app',
      title: 'Badge Earned! 🏆',
      message: `Congratulations! You have earned the "${badgeName}" badge (${badgeId}).`,
    });
  }

  // -------------------------------------------------------------------------
  // Preferences management
  // -------------------------------------------------------------------------

  upsertPreferences(userId: string, updateDto: UpdateNotificationPreferencesDto): NotificationPreferences {
    const existing = this.preferences.get(userId) || {
      userId,
      email_alerts: false,
      push_notifications: false,
      marketing_updates: false,
      grading_failure_alerts: true,
      badge_earned_alerts: true,
    };

    const updated = { ...existing, ...updateDto };
    this.preferences.set(userId, updated);
    return updated;
  }

  getPreferences(userId: string): NotificationPreferences {
    return this.preferences.get(userId) || {
      userId,
      email_alerts: false,
      push_notifications: false,
      marketing_updates: false,
      grading_failure_alerts: true,
      badge_earned_alerts: true,
    };
  }
}
