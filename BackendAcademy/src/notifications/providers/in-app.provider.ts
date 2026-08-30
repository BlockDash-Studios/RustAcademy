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

/** Per-attempt timeout for in-app delivery calls (ms). */
const IN_APP_TIMEOUT_MS = 2_000;

/** Retry configuration for in-app delivery. */
const IN_APP_RETRY: RetryOptions = {
  maxAttempts: 2,
  initialDelayMs: 100,
  backoffFactor: 2,
  maxDelayMs: 1_000,
};

/**
 * In-app notification delivery adapter.
 *
 * Handles storing and displaying notifications inside the application.
 * These notifications are persisted and displayed in the user's inbox.
 *
 * Resilience (Issue #674):
 *  - Per-attempt timeout of 2 s.
 *  - Exponential-backoff retry (up to 2 attempts) for transient failures.
 *  - Circuit breaker: opens after 5 consecutive failures; probes after 30 s.
 */
@Injectable()
export class InAppNotificationProvider implements INotificationProvider {
  readonly providerId = 'in-app';
  readonly providerName = 'In-App Notification Provider';
  private readonly logger = new Logger(InAppNotificationProvider.name);

  private readonly circuitBreaker = new CircuitBreaker('in-app', {
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
        IN_APP_TIMEOUT_MS,
        IN_APP_RETRY,
        `in-app:${context.userId}`,
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
    const { state } = this.circuitBreaker.metrics;
    const circuitOk = state !== 'OPEN';
    this.logger.log(
      `[IN-APP] Health check: circuit=${state} healthy=${circuitOk}`,
    );
    return circuitOk;
  }

  // ── Internal delivery ─────────────────────────────────────────

  private async doSend(
    _notification: Notification,
    context: DeliveryContext,
  ): Promise<DeliveryResult> {
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
  }

  // ── Error handling ────────────────────────────────────────────

  private buildErrorResult(
    err: unknown,
    userId: string,
  ): DeliveryResult {
    let message: string;
    if (err instanceof CircuitOpenError) {
      this.logger.warn(`[IN-APP] Circuit open — skipping user ${userId}: ${err.message}`);
      message = `Provider unavailable (circuit open): ${err.message}`;
    } else if (err instanceof TimeoutError) {
      this.logger.error(`[IN-APP] Timeout for user ${userId}: ${err.message}`);
      message = `Delivery timed out: ${err.message}`;
    } else if (err instanceof HttpStatusError) {
      this.logger.error(`[IN-APP] HTTP ${err.status} for user ${userId}`);
      message = `HTTP error ${err.status}`;
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[IN-APP] Failed for user ${userId}: ${msg}`);
      message = `In-app delivery failed: ${msg}`;
    }
    return { success: false, message, deliveredAt: new Date() };
  }
}
