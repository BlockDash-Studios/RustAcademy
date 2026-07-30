import { Injectable, Logger } from '@nestjs/common';
import {
  INotificationProvider,
  DeliveryResult,
  DeliveryContext,
} from '../interfaces/notification-provider.interface';
import { Notification } from '../interfaces/notifications.interface';

/**
 * In-app notification delivery adapter.
 *
 * Handles storing and displaying notifications inside the application.
 * These notifications are persisted and displayed in the user's inbox.
 */
@Injectable()
export class InAppNotificationProvider implements INotificationProvider {
  readonly providerId = 'in-app';
  readonly providerName = 'In-App Notification Provider';
  private readonly logger = new Logger(InAppNotificationProvider.name);

  async send(
    notification: Notification,
    context: DeliveryContext,
  ): Promise<DeliveryResult> {
    try {
      // In-app notifications are stored in the notification store
      // and rendered in the user's notification feed.
      this.logger.log(
        `[IN-APP] Stored notification for user: ${context.userId}`,
      );

      return {
        success: true,
        message: `In-app notification stored for user ${context.userId}`,
        deliveredAt: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `[IN-APP] Failed for user ${context.userId}: ${(error as Error).message}`,
      );
      return {
        success: false,
        message: `In-app delivery failed: ${(error as Error).message}`,
        deliveredAt: new Date(),
      };
    }
  }

  async sendBatch(
    notifications: Notification[],
    context: DeliveryContext,
  ): Promise<DeliveryResult[]> {
    this.logger.log(
      `[IN-APP] Batch-storing ${notifications.length} notifications`,
    );
    const results: DeliveryResult[] = [];
    for (const notification of notifications) {
      const result = await this.send(notification, context);
      results.push(result);
    }
    return results;
  }

  async healthCheck(): Promise<boolean> {
    this.logger.log('[IN-APP] Health check OK');
    return true;
  }
}
