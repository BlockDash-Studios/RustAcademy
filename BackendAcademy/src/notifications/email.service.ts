import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    // In a real application, this would integrate with an email provider like SendGrid, SES, etc.
    this.logger.log(`Sending welcome email to ${name} <${email}>`);
    
    // Simulate email sending delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    this.logger.log(`Successfully sent welcome email to ${email}`);
  }

  async sendMilestoneEmail(email: string, name: string, milestone: string): Promise<void> {
    this.logger.log(`Sending milestone '${milestone}' email to ${name} <${email}>`);
    
    // Simulate email sending delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    this.logger.log(`Successfully sent milestone email to ${email}`);
  }
}
