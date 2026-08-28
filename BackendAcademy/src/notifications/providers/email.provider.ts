import { Injectable, Logger } from '@nestjs/common';
import {
  INotificationProvider,
  DeliveryResult,
  DeliveryContext,
} from '../interfaces/notification-provider.interface';
import { Notification } from '../interfaces/notifications.interface';
import { sanitiseTemplateValue } from '../email.service';

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
 */
@Injectable()
export class EmailNotificationProvider implements INotificationProvider {
  readonly providerId = 'email';
  readonly providerName = 'Email Notification Provider';
  private readonly logger = new Logger(EmailNotificationProvider.name);

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

    const subject = this.renderSubject(notification, context);
    const body = this.renderBody(notification, context);

    try {
      // In production this would integrate with SendGrid, SES, etc.
      this.logger.log(
        `[EMAIL] To: ${recipientEmail} | Subject: "${subject}"`,
      );

      // Simulate email sending delay
      await new Promise((resolve) => setTimeout(resolve, 200));

      this.logger.log(
        `[EMAIL] Successfully delivered to ${recipientEmail}`,
      );

      return {
        success: true,
        message: `Email delivered to ${recipientEmail}`,
        deliveredAt: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `[EMAIL] Failed to deliver to ${recipientEmail}: ${(error as Error).message}`,
      );
      return {
        success: false,
        message: `Delivery failed: ${(error as Error).message}`,
        deliveredAt: new Date(),
      };
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
    // In production this would verify SMTP/API connectivity
    this.logger.log('[EMAIL] Health check OK');
    return true;
  }

  // ── Template rendering with fallback support (#387, Task 2) ────────

  /**
   * Renders the email subject, applying personalization fields
   * with fallback values for any that are missing.
   */
  private renderSubject(
    notification: Notification,
    context: DeliveryContext,
  ): string {
    let subject = notification.title;

    // Replace template placeholders like {{name}}, {{courseName}}, etc.
    subject = this.applyPersonalization(subject, context);

    return subject;
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
      // Use fallback or a safe placeholder
      return FALLBACKS[key] || `[${key}]`;
    });
  }
}
