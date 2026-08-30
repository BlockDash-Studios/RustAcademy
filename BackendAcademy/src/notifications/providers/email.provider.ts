import { Injectable, Logger } from '@nestjs/common';
import {
  INotificationProvider,
  DeliveryResult,
  DeliveryContext,
} from '../interfaces/notification-provider.interface';
import { Notification } from '../interfaces/notifications.interface';
import { sanitiseTemplateValue } from '../email.service';
import {
  CircuitBreaker,
  CircuitBreakerMetrics,
  resilientCall,
  RetryOptions,
  TimeoutError,
  CircuitOpenError,
  HttpStatusError,
} from './provider-resilience';

/**
 * Default fallback values for missing personalization fields.
 * Ensures email templates never render blank or broken content.
 */
const FALLBACKS: Record<string, string> = {
  name: 'RustAcademy Learner',
  email: '',
  courseName: 'your course',
  milestoneName: 'a new milestone',
  submissionTitle: 'your submission',
  badgeName: 'a badge',
  rewardAmount: 'a reward',
};

/** Per-attempt timeout for email delivery calls (ms). */
const EMAIL_TIMEOUT_MS = 5_000;

/** Retry configuration for email delivery. */
const EMAIL_RETRY: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 300,
  backoffFactor: 2,
  maxDelayMs: 5_000,
};

/**
 * Email delivery adapter implementing the INotificationProvider interface.
 *
 * Handles sending notifications via email. Supports template-based rendering
 * with fallback content for missing personalization fields so broken
 * or blank email content is never sent to users.
 *
 * All user-supplied values are HTML-escaped and dangerous constructs
 * (script, iframe, etc.) are stripped before interpolation to prevent
 * XSS attacks in email content.
 *
 * Resilience (Issue #674):
 *  - Per-attempt timeout of 5 s.
 *  - Exponential-backoff retry (up to 3 attempts) for transient failures.
 *  - Circuit breaker: opens after 5 consecutive failures; probes after 30 s.
 */
@Injectable()
export class EmailNotificationProvider implements INotificationProvider {
  readonly providerId = 'email';
  readonly providerName = 'Email Notification Provider';
  private readonly logger = new Logger(EmailNotificationProvider.name);

  private readonly circuitBreaker = new CircuitBreaker('email', {
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
    const recipientEmail = context.email;
    if (!recipientEmail) {
      this.logger.warn(
        `Cannot send email notification — no email address for user ${context.userId}`,
      );
      return {
        success: false,
        message: 'No recipient email address provided',
        deliveredAt: new Date(),
      };
    }

    try {
      const result = await resilientCall(
        () => this.doSend(notification, context, recipientEmail),
        this.circuitBreaker,
        EMAIL_TIMEOUT_MS,
        EMAIL_RETRY,
        `email:${context.userId}`,
      );
      return result;
    } catch (err) {
      return this.buildErrorResult(err, context.userId, 'EMAIL');
    }
  }

  async sendBatch(
    notifications: Notification[],
    context: DeliveryContext,
  ): Promise<DeliveryResult[]> {
    this.logger.log(
      `[EMAIL] Batch-sending ${notifications.length} notifications`,
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
      `[EMAIL] Health check: circuit=${state} healthy=${circuitOk}`,
    );
    return circuitOk;
  }

  // ── Internal delivery ─────────────────────────────────────────

  private async doSend(
    notification: Notification,
    context: DeliveryContext,
    recipientEmail: string,
  ): Promise<DeliveryResult> {
    const subject = this.renderSubject(notification, context);
    this.logger.log(
      `[EMAIL] To: ${recipientEmail} | Subject: "${subject}"`,
    );

    // In production this would integrate with SendGrid, SES, etc.
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    this.logger.log(
      `[EMAIL] Successfully delivered to ${recipientEmail}`,
    );

    return {
      success: true,
      message: `Email delivered to ${recipientEmail}`,
      deliveredAt: new Date(),
    };
  }

  // ── Error handling ────────────────────────────────────────────

  private buildErrorResult(
    err: unknown,
    userId: string,
    tag: string,
  ): DeliveryResult {
    let message: string;
    if (err instanceof CircuitOpenError) {
      this.logger.warn(`[${tag}] Circuit open — skipping user ${userId}: ${err.message}`);
      message = `Provider unavailable (circuit open): ${err.message}`;
    } else if (err instanceof TimeoutError) {
      this.logger.error(`[${tag}] Timeout for user ${userId}: ${err.message}`);
      message = `Delivery timed out: ${err.message}`;
    } else if (err instanceof HttpStatusError) {
      this.logger.error(`[${tag}] HTTP ${err.status} for user ${userId}`);
      message = `HTTP error ${err.status}`;
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[${tag}] Failed for user ${userId}: ${msg}`);
      message = `Delivery failed: ${msg}`;
    }
    return { success: false, message, deliveredAt: new Date() };
  }

  // ── Template rendering with fallback support (#387, Task 2) ────────

  private renderSubject(
    notification: Notification,
    context: DeliveryContext,
  ): string {
    return this.applyPersonalization(notification.title, context);
  }

  /**
   * Renders the email body with personalization and fallback values.
   *
   * Missing personalization fields never result in blank or broken
   * content — every placeholder resolves to a sensible default.
   */
  private renderBody(
    notification: Notification,
    context: DeliveryContext,
  ): string {
    let body = notification.message;

    // Greeting line
    const displayName = context.name || FALLBACKS.name;
    body = `Hello ${displayName},\n\n` + body;

    // Replace template placeholders
    body = this.applyPersonalization(body, context);

    // Footer
    body += '\n\n— The RustAcademy Team';

    return body;
  }

  /**
   * Replaces {{placeholder}} patterns in text with values from the
   * delivery context, falling back to defaults for any missing fields.
   *
   * Security (Task 2):
   *  - All interpolated values are HTML-escaped via `sanitiseTemplateValue`
   *    to prevent XSS when email content is rendered in HTML-capable
   *    email clients.
   *  - Dangerous HTML constructs (script, iframe, object, embed) are
   *    stripped before escaping as a defence-in-depth measure.
   *  - Unknown or missing placeholders fall back to `[keyName]` for
   *    predictable, documented behaviour.
   */
  private applyPersonalization(
    text: string,
    context: DeliveryContext,
  ): string {
    const fields: Record<string, string | undefined> = {
      name: context.name,
      email: context.email,
      ...(context.personalization || {}),
    };

    return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      const value = fields[key];
      if (value !== undefined && value !== null && value !== '') {
        return sanitiseTemplateValue(value);
      }
      return FALLBACKS[key] || `[${key}]`;
    });
  }
}
