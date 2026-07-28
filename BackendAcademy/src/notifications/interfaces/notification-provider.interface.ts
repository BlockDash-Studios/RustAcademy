import { Notification } from './notifications.interface';

/**
 * Delivery result returned by notification providers.
 */
export interface DeliveryResult {
  /** Whether the delivery succeeded */
  success: boolean;
  /** Provider-specific message or error detail */
  message?: string;
  /** Timestamp of the delivery attempt */
  deliveredAt?: Date;
}

/**
 * Notification priority levels for batching and delivery ordering.
 */
export enum NotificationPriority {
  /** Critical alerts delivered immediately (e.g., security, payment) */
  HIGH = 'high',
  /** Standard notifications delivered promptly */
  NORMAL = 'normal',
  /** Low-priority reminders eligible for batching */
  LOW = 'low',
}

/**
 * Context passed to providers containing user data and personalization fields.
 */
export interface DeliveryContext {
  userId: string;
  email?: string;
  name?: string;
  /** Additional personalization key-value pairs */
  personalization?: Record<string, string | undefined>;
  priority?: NotificationPriority;
  /** Whether to batch this notification with others of the same priority */
  batchable?: boolean;
}

/**
 * Abstraction for all notification delivery channels.
 *
 * Each provider (email, push, in-app) implements this interface so that
 * NotificationsService can deliver through any channel without being
 * coupled to a specific implementation.
 */
export interface INotificationProvider {
  /** Unique identifier for this provider */
  readonly providerId: string;

  /** Human-readable name */
  readonly providerName: string;

  /**
   * Delivers a notification through this channel.
   *
   * @param notification - The notification to deliver
   * @param context - Delivery context with user data and personalization
   * @returns Result of the delivery attempt
   */
  send(notification: Notification, context: DeliveryContext): Promise<DeliveryResult>;

  /**
   * Batch-delivers multiple notifications in a single call.
   * Providers that support batching can optimize delivery.
   *
   * @param notifications - Notifications to batch-deliver
   * @param context - Shared delivery context
   * @returns Array of results for each notification
   */
  sendBatch?(
    notifications: Notification[],
    context: DeliveryContext,
  ): Promise<DeliveryResult[]>;

  /**
   * Checks whether this provider is healthy and ready to deliver.
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Token used for injecting the list of all notification providers.
 */
export const NOTIFICATION_PROVIDERS = 'NOTIFICATION_PROVIDERS';
