import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { AppConfigService } from '../../config/app-config.service';
import { BaseExportDeliveryAdapter } from './export-delivery.adapter';
import type { ExportDeliveryResult, IExportDeliveryAdapter } from './export-delivery.adapter';
import type { ExportGenerationPayload } from '../types/job-payloads.types';

/**
 * Download link export delivery adapter
 *
 * Uploads the export file to Supabase Storage and returns a signed URL
 * valid for the configured expiry period.
 */
@Injectable()
export class DownloadLinkAdapter
  extends BaseExportDeliveryAdapter
  implements IExportDeliveryAdapter
{
  readonly method = 'download' as const;

  constructor(
    supabase: SupabaseService,
    private readonly config: AppConfigService,
  ) {
    super(supabase);
  }

  async deliver(
    payload: ExportGenerationPayload,
    exportData: string,
    format: 'csv' | 'json',
  ): Promise<ExportDeliveryResult> {
    const bucket = this.config.exportStorageBucket;
    const expiryMs = this.config.exportLinkExpiryMs;

    if (!bucket) {
      return {
        success: false,
        error: 'EXPORT_STORAGE_BUCKET is not configured',
      };
    }

    const objectPath = this.buildObjectPath(payload, format);
    this.logger.log(
      `Uploading ${format} export to Supabase Storage (bucket: ${bucket}, path: ${objectPath})`,
    );

    try {
      const client = this.supabase.getClient();

      const { error: uploadError } = await client.storage
        .from(bucket)
        .upload(objectPath, exportData, {
          contentType: format === 'csv' ? 'text/csv' : 'application/json',
          upsert: true,
        });

      if (uploadError) {
        const error = `Supabase Storage upload failed: ${uploadError.message}`;
        this.logger.error(`Download link export delivery failed: ${error}`);
        return { success: false, error };
      }

      const { data: signedData, error: signError } = await client.storage
        .from(bucket)
        .createSignedUrl(objectPath, expiryMs / 1000);

      if (signError || !signedData?.signedUrl) {
        const error = `Supabase Storage sign failed: ${signError?.message ?? 'no signed URL returned'}`;
        this.logger.error(`Download link export delivery failed: ${error}`);
        return { success: false, error };
      }

      const downloadUrl = signedData.signedUrl;

      this.logger.log(
        `Download link generated successfully (userId: ${payload.userId}, url: ${downloadUrl})`,
      );

      return {
        success: true,
        deliveryUrl: downloadUrl,
        metadata: {
          bucket,
          objectPath,
          expiresInMs: expiryMs,
        },
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown download link delivery error';
      this.logger.error(
        `Download link export delivery error: ${errorMessage} (userId: ${payload.userId})`,
      );
      return { success: false, error: errorMessage };
    }
  }

  private buildObjectPath(
    payload: ExportGenerationPayload,
    format: 'csv' | 'json',
  ): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `exports/${payload.userId}/${payload.exportType}/${timestamp}.${format}`;
  }
}
