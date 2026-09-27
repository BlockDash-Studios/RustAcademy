import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { BaseExportDeliveryAdapter } from './export-delivery.adapter';
import type { ExportDeliveryResult, IExportDeliveryAdapter } from './export-delivery.adapter';
import type { ExportGenerationPayload } from '../types/job-payloads.types';

interface SendGridResponse {
  headers: Headers;
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

/**
 * Email export delivery adapter
 *
 * Sends the export file as an email attachment via the SendGrid API.
 * Requires SENDGRID_API_KEY and SENDGRID_FROM_EMAIL environment variables.
 */
@Injectable()
export class EmailDeliveryAdapter
  extends BaseExportDeliveryAdapter
  implements IExportDeliveryAdapter
{
  readonly method = 'email' as const;
  private readonly maxResponseBodyLength = 500;

  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  async deliver(
    payload: ExportGenerationPayload,
    exportData: string,
    format: 'csv' | 'json',
  ): Promise<ExportDeliveryResult> {
    const apiKey = process.env['SENDGRID_API_KEY'];
    const fromEmail = process.env['SENDGRID_FROM_EMAIL'];
    const recipientEmail = payload.email;

    if (!apiKey || !fromEmail) {
      return {
        success: false,
        error: 'SendGrid is not configured (SENDGRID_API_KEY or SENDGRID_FROM_EMAIL missing)',
      };
    }

    if (!recipientEmail) {
      return {
        success: false,
        error: 'No recipient email configured for export delivery',
      };
    }

    const filename = `export-${payload.exportType}-${payload.userId}-${Date.now()}.${format}`;
    const mimeType = format === 'csv' ? 'text/csv' : 'application/json';
    const attachment = this.encodeBase64(exportData);

    this.logger.log(
      `Sending ${format} export via email to ${recipientEmail} (userId: ${payload.userId})`,
    );

    try {
      const body = {
        personalizations: [
          {
            to: [{ email: recipientEmail }],
            subject: `Your ${format.toUpperCase()} Export is Ready`,
          },
        ],
        from: { email: fromEmail },
        content: [
          {
            type: 'text/plain',
            value:
              `Your ${payload.exportType} export in ${format.toUpperCase()} format is attached.\n` +
              `Generated at: ${new Date().toISOString()}`,
          },
        ],
        attachments: [
          {
            content: attachment,
            filename,
            type: mimeType,
            disposition: 'attachment',
          },
        ],
      };

      const response = (await fetch(
        'https://api.sendgrid.com/v3/mail/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      )) as SendGridResponse;

      const responseText = await response.text();

      if (!response.ok) {
        const error = `SendGrid error ${response.status}: ${responseText}`;
        this.logger.error(`Email export delivery failed: ${error}`);
        return { success: false, error };
      }

      const messageId = response.headers.get('X-Message-Id') ?? undefined;
      this.logger.log(
        `Email export sent successfully to ${recipientEmail} (messageId: ${messageId})`,
      );
      return {
        success: true,
        metadata: {
          messageId,
          recipientEmail,
          filename,
        },
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown email delivery error';
      this.logger.error(
        `Email export delivery error: ${errorMessage} (recipient: ${recipientEmail})`,
      );
      return { success: false, error: errorMessage, metadata: { recipientEmail } };
    }
  }

  private encodeBase64(data: string): string {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(data).toString('base64');
    }
    return btoa(unescape(encodeURIComponent(data)));
  }
}
