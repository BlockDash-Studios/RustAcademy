import { Injectable, Logger } from '@nestjs/common';
import {
  INotificationProvider,
  DeliveryResult,
  DeliveryContext,
} from '../interfaces/notification-provider.interface';
import { Notification } from '../interfaces/notifications.interface';
import {
  CircuitBreaker,
  CircuitBreakerMetrics,
  resilientCall,
  RetryOptions,
  TimeoutError,
  CircuitOpenError,
  HttpStatusError,
} from './provider-resilience';

/** Per-attempt timeout for push delivery calls (ms). */
const PUSH_TIMEOUT_MS = 3_000;

/** Retry configuration for push delivery. */
const PUSH_RETRY: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 200,
  backoffFactor: 2,
  maxDelayMs: 4_000,
};

/**
 * Push notification delivery adapter.
 *
 * Handles sending push notifications to user devices via FCM/APNs.
 *
 * Resilience (Issue #674):
 *  - Per-attempt timeout of 3 s.
 *  - Exponential-backoff retry (up to 3 attempts) for transient failures.
 *  - Circuit breaker: opens after 5 consecutive failures; probes after 30 s.
 */
@Injectable()
export class PushNotificationProvider implements INotificationProvider {
  readonly providerId = 'push';
  readonly providerName = 'Push Notification Provider';
  private readonly logger = new Logger(PushNotificationProvider.name);

  private readonly circuitBreaker = new CircuitBreaker('push', {
    failureThreshold: 5,
    recoveryTimeoutMs: 30_000,
    halfOpenProbes: 1,
  });

  /** Expose circuit metrics for the health endpoint. */
  get circuitMetrics(): CircuitBreakerMetrics {
    return this.circuitBreaker.metrics;
  }

  async send(
    notification: Notification,
    context: DeliveryContext,
  ): Promise<DeliveryResult> {
    try {
      return await resilientCall(
        () => this.doSend(notification, context),
        this.circuitBreaker,
        PUSH_TIMEOUT_MS,
        PUSH_RETRY,
        `push:${context.userId}`,
      );
    } catch (err) {
      return this.buildErrorResult(err, context.userId);
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
    const { state } = this.circuitBreaker.metrics;
    const circuitOk = state !== 'OPEN';
    this.logger.log(
      `[PUSH] Health check: circuit=${state} healthy=${circuitOk}`,
    );
    return circuitOk;
  }

  // ── Internal delivery ─────────────────────────────────────────

  private async doSend(
    notification: Notification,
    context: DeliveryContext,
  ): Promise<DeliveryResult> {
    // In production this would integrate with Firebase Cloud Messaging
    // or Apple Push Notification service.
    this.logger.log(
      `[PUSH] To user: ${context.userId} | Title: "${notification.title}"`,
    );

    // Simulate push delivery
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    return {
      success: true,
      message: `Push delivered to user ${context.userId}`,
      deliveredAt: new Date(),
    };
  }

  // ── Error handling ────────────────────────────────────────────

  private buildErrorResult(
    err: unknown,
    userId: string,
  ): DeliveryResult {
    let message: string;
    if (err instanceof CircuitOpenError) {
      this.logger.warn(`[PUSH] Circuit open — skipping user ${userId}: ${err.message}`);
      message = `Provider unavailable (circuit open): ${err.message}`;
    } else if (err instanceof TimeoutError) {
      this.logger.error(`[PUSH] Timeout for user ${userId}: ${err.message}`);
      message = `Delivery timed out: ${err.message}`;
    } else if (err instanceof HttpStatusError) {
      this.logger.error(`[PUSH] HTTP ${err.status} for user ${userId}`);
      message = `HTTP error ${err.status}`;
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[PUSH] Failed for user ${userId}: ${msg}`);
      message = `Push delivery failed: ${msg}`;
    }
    return { success: false, message, deliveredAt: new Date() };
  }
}
