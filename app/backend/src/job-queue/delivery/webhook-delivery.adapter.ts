import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { BaseExportDeliveryAdapter } from './export-delivery.adapter';
import type { ExportDeliveryResult, IExportDeliveryAdapter } from './export-delivery.adapter';
import type { ExportGenerationPayload } from '../types/job-payloads.types';

/**
 * Webhook export delivery adapter
 *
 * Delivers the export file by POSTing it to a configured webhook URL.
 * The export data is included in the JSON payload under the `exportData` field.
 */
@Injectable()
export class WebhookDeliveryAdapter
  extends BaseExportDeliveryAdapter
  implements IExportDeliveryAdapter
{
  readonly method = 'webhook' as const;
  private readonly maxResponseBodyLength = 1000;
  private readonly requestTimeoutMs = 30_000;

  constructor(supabase: SupabaseService) {
    super(supabase);
  }

  async deliver(
    payload: ExportGenerationPayload,
    exportData: string,
    format: 'csv' | 'json',
  ): Promise<ExportDeliveryResult> {
    const webhookUrl = payload.webhookUrl;
    if (!webhookUrl) {
      return {
        success: false,
        error: 'No webhook URL configured for export delivery',
      };
    }

    this.logger.log(
      `Delivering ${format} export to webhook ${webhookUrl} (userId: ${payload.userId}, exportType: ${payload.exportType})`,
    );

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.requestTimeoutMs,
      );

      const body = JSON.stringify({
        eventType: 'export.ready',
        userId: payload.userId,
        exportType: payload.exportType,
        format,
        exportData,
        filters: payload.filters,
        deliveredAt: new Date().toISOString(),
      });

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X- RustAcademy-Event': 'export.ready',
          'User-Agent': ' RustAcademy-Export/1.0',
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let responseBody: string | undefined;
      try {
        const text = await response.text();
        responseBody =
          text.length > this.maxResponseBodyLength
            ? text.slice(0, this.maxResponseBodyLength) + '...'
            : text;
      } catch {
        responseBody = undefined;
      }

      if (response.status >= 200 && response.status < 300) {
        this.logger.log(
          `Webhook export delivered successfully (status: ${response.status}, webhook: ${webhookUrl})`,
        );
        return {
          success: true,
          deliveryUrl: webhookUrl,
          metadata: {
            httpStatus: response.status,
            responseBody,
          },
        };
      }

      const error = `Webhook returned HTTP ${response.status}: ${responseBody ?? 'no response body'}`;
      this.logger.error(`Webhook export delivery failed: ${error}`);
      return { success: false, error, deliveryUrl: webhookUrl };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown webhook delivery error';
      this.logger.error(
        `Webhook export delivery error: ${errorMessage} (webhook: ${webhookUrl})`,
      );
      return { success: false, error: errorMessage, deliveryUrl: webhookUrl };
    }
  }
}
