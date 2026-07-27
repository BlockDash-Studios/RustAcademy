export interface NotificationPreferences {
  userId: string;
  email_alerts: boolean;
  push_notifications: boolean;
  marketing_updates: boolean;

  /** Issue #360: Receive a notification when a grading attempt fails permanently */
  grading_failure_alerts: boolean;
  /** Issue #362: Receive a notification when a new badge is earned */
  badge_earned_alerts: boolean;
}
