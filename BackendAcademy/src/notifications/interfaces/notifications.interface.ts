export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  /**
   * Deterministic deduplication key.
   *
   * When set, the notification service will reject duplicate notifications
   * carrying the same event key within the configured deduplication window.
   * Retries and scheduled jobs that produce the same event key will therefore
   * only result in a single delivered notification.
   */
  eventKey?: string;
}
