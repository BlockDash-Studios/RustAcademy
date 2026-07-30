import { Injectable, Logger } from '@nestjs/common';

/**
 * Default fallback values for missing personalization fields.
 *
 * Ensures email templates never render broken or blank content when
 * user profile data is incomplete (issue #387).
 */
const FALLBACKS: Record<string, string> = {
  name: 'RustAcademy Learner',
  email: '',
  courseName: 'your course',
  milestoneName: 'a new milestone',
  badgeName: 'a new badge',
  rewardAmount: 'a reward',
  submissionTitle: 'your submission',
  challengeName: 'a challenge',
  tutorName: 'your tutor',
};

/**
 * Fields available for email template personalization.
 */
export interface EmailTemplateFields {
  name?: string;
  email?: string;
  courseName?: string;
  milestoneName?: string;
  badgeName?: string;
  rewardAmount?: string;
  submissionTitle?: string;
  challengeName?: string;
  tutorName?: string;
  [key: string]: string | undefined;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  /**
   * Sends a welcome email with template personalization.
   *
   * Missing personalization fields are replaced with sensible defaults
   * so the user never sees broken or blank content.
   */
  async sendWelcomeEmail(
    email: string,
    fields: EmailTemplateFields = {},
  ): Promise<void> {
    const displayName = this.resolveField(fields.name, 'name');
    const subject = this.renderTemplate(
      'Welcome to RustAcademy, {{name}}!',
      { name: displayName },
    );
    const body = this.renderTemplate(
      `Hello {{name}},\n\nWelcome to RustAcademy! We're excited to have you on board.\n\nStart your first lesson today and begin earning XLM rewards.\n\n— The RustAcademy Team`,
      { name: displayName, email },
    );

    this.logger.log(
      `Sending welcome email to ${displayName} <${email}> | Subject: "${subject}"`,
    );

    // In production, this would integrate with SendGrid, SES, etc.
    await new Promise((resolve) => setTimeout(resolve, 500));

    this.logger.log(`Successfully sent welcome email to ${email}`);
  }

  /**
   * Sends a milestone email with fallback for missing milestone names.
   */
  async sendMilestoneEmail(
    email: string,
    fields: EmailTemplateFields = {},
  ): Promise<void> {
    const displayName = this.resolveField(fields.name, 'name');
    const milestone = this.resolveField(fields.milestoneName, 'milestoneName');

    const subject = this.renderTemplate(
      '🎉 You reached {{milestoneName}}!',
      { milestoneName: milestone, name: displayName },
    );
    const body = this.renderTemplate(
      `Hello {{name}},\n\nCongratulations on reaching {{milestoneName}}!\n\nKeep up the great work.\n\n— The RustAcademy Team`,
      { name: displayName, milestoneName: milestone, email },
    );

    this.logger.log(
      `Sending milestone '${milestone}' email to ${displayName} <${email}>`,
    );

    await new Promise((resolve) => setTimeout(resolve, 500));

    this.logger.log(`Successfully sent milestone email to ${email}`);
  }

  /**
   * Sends a course completion notification email.
   */
  async sendCourseCompletionEmail(
    email: string,
    fields: EmailTemplateFields = {},
  ): Promise<void> {
    const displayName = this.resolveField(fields.name, 'name');
    const courseName = this.resolveField(fields.courseName, 'courseName');

    const subject = this.renderTemplate(
      '🏆 You completed {{courseName}}!',
      { courseName, name: displayName },
    );
    const body = this.renderTemplate(
      `Hello {{name}},\n\nAmazing work! You've completed {{courseName}}.\n\nCheck your rewards in the dashboard.\n\n— The RustAcademy Team`,
      { name: displayName, courseName, email },
    );

    this.logger.log(
      `Sending course completion email for '${courseName}' to ${displayName} <${email}>`,
    );

    await new Promise((resolve) => setTimeout(resolve, 500));

    this.logger.log(`Successfully sent course completion email to ${email}`);
  }

  /**
   * Sends a submission graded notification email.
   */
  async sendSubmissionGradedEmail(
    email: string,
    fields: EmailTemplateFields = {},
  ): Promise<void> {
    const displayName = this.resolveField(fields.name, 'name');
    const submissionTitle = this.resolveField(
      fields.submissionTitle,
      'submissionTitle',
    );

    const subject = this.renderTemplate(
      '📝 Your submission "{{submissionTitle}}" has been graded',
      { submissionTitle, name: displayName },
    );
    const body = this.renderTemplate(
      `Hello {{name}},\n\nYour submission "{{submissionTitle}}" has been reviewed and graded.\n\nCheck your results now.\n\n— The RustAcademy Team`,
      { name: displayName, submissionTitle, email },
    );

    this.logger.log(
      `Sending submission graded email for '${submissionTitle}' to ${displayName} <${email}>`,
    );

    await new Promise((resolve) => setTimeout(resolve, 500));

    this.logger.log(`Successfully sent submission graded email to ${email}`);
  }

  // ── Template rendering with fallbacks (#387) ───────────────

  /**
   * Renders a template string by replacing {{key}} placeholders
   * with values from the provided fields object. Any missing or
   * empty fields are replaced with sensible defaults so the
   * rendered content is never broken or blank.
   *
   * This is the core fix for issue #387.
   */
  renderTemplate(
    template: string,
    fields: EmailTemplateFields = {},
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      const value = fields[key];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
      // Resolve to a safe fallback default
      const fallback = FALLBACKS[key] || `[${key}]`;
      this.logger.debug(
        `Email template: using fallback "${fallback}" for missing field "${key}"`,
      );
      return fallback;
    });
  }

  /**
   * Resolves a personalization field to either its provided value
   * or a safe fallback. Used as a convenience wrapper around the
   * FALLBACKS map.
   */
  resolveField(
    value: string | undefined,
    fallbackKey: string,
  ): string {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
    return FALLBACKS[fallbackKey] || `[${fallbackKey}]`;
  }
}
