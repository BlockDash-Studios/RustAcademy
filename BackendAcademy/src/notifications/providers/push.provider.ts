import { Injectable, Logger } from '@nestjs/common';
import {
  INotificationProvider,
  DeliveryResult,
  DeliveryContext,
} from '../interfaces/notification-provider.interface';
import { Notification } from '../interfaces/notifications.interface';

/**
 * Push notification delivery adapter.
 *
 * Handles sending push notifications to user devices via FCM/APNs.
 */
@Injectable()
export class PushNotificationProvider implements INotificationProvider {
  readonly providerId = 'push';
  readonly providerName = 'Push Notification Provider';
  private readonly logger = new Logger(PushNotificationProvider.name);

  async send(
    notification: Notification,
    context: DeliveryContext,
  ): Promise<DeliveryResult> {
    try {
      // In production this would integrate with Firebase Cloud Messaging
      // or Apple Push Notification service.
      this.logger.log(
        `[PUSH] To user: ${context.userId} | Title: "${notification.title}"`,
      );

      // Simulate push delivery
      await new Promise((resolve) => setTimeout(resolve, 100));

      return {
        success: true,
        message: `Push delivered to user ${context.userId}`,
        deliveredAt: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `[PUSH] Failed for user ${context.userId}: ${(error as Error).message}`,
      );
      return {
        success: false,
        message: `Push delivery failed: ${(error as Error).message}`,
        deliveredAt: new Date(),
      };
    }
  }

  async sendBatch(
    notifications: Notification[],
    context: DeliveryContext,
  ): Promise<DeliveryResult[]> {
    this.logger.log(
      `[PUSH] Batch-sending ${notifications.length} push notifications`,
    );
    const results: DeliveryResult[] = [];
    for (const notification of notifications) {
      const result = await this.send(notification, context);
      results.push(result);
    }
    return results;
  }

  async healthCheck(): Promise<boolean> {
    this.logger.log('[PUSH] Health check OK');
    return true;
  }
}
