/**
 * Job Queue System - Export Generation Handler
 * 
 * Implements the JobHandler interface for export generation jobs.
 * Generates CSV/JSON exports from database queries and delivers via specified method.
 * 
 * Requirements: 9.3, 9.4, 9.5, 15.4, 15.5
 */

import { Injectable, Logger } from '@nestjs/common';
import { JobHandler, Job, CancellationToken } from '../types';
import { ExportGenerationPayload } from '../types/job-payloads.types';
import { SupabaseService } from '../../supabase/supabase.service';
import { NotificationService } from '../../notifications/notification.service';
import {
  WebhookDeliveryAdapter,
  EmailDeliveryAdapter,
  DownloadLinkAdapter,
} from '../delivery';
import type {
  ExportFailedPayload,
  ExportDeliveredPayload,
} from '../../notifications/types/notification.types';

/**
 * Error thrown for permanent job failures (no retry)
 */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

/**
 * Export Generation Handler
 * 
 * Generates CSV/JSON exports from database queries.
 * Checks cancellation token every 1000 records during export generation.
 * Delivers export via specified deliveryMethod (webhook, email, download link).
 */
@Injectable()
export class ExportGenerationHandler implements JobHandler<ExportGenerationPayload> {
  private readonly logger = new Logger(ExportGenerationHandler.name);
  private readonly cancellationCheckInterval = 1000; // Check every 1000 records

  /** Exponential backoff delays: 1m, 5m, 30m */
  private readonly BACKOFF_DELAYS_MS = [
    60_000,      // 1 minute
    300_000,     // 5 minutes
    1_800_000,   // 30 minutes
  ];

  constructor(
    private readonly supabase: SupabaseService,
    private readonly notificationService: NotificationService,
    private readonly webhookAdapter: WebhookDeliveryAdapter,
    private readonly emailAdapter: EmailDeliveryAdapter,
    private readonly downloadAdapter: DownloadLinkAdapter,
  ) {}

  /**
   * Execute export generation
   * 
   * Generates CSV/JSON export from database queries based on exportType and filters.
   * Checks cancellation token every 1000 records during generation.
   * Delivers export via specified deliveryMethod.
   * 
   * @param job - The export generation job
   * @param cancellationToken - Token to check for cancellation
   * @throws PermanentJobError for validation failures
   * @throws Error for transient failures (database errors, delivery failures)
   * 
   * **Validates: Requirements 9.3, 9.4, 9.5**
   */
  async execute(job: Job<ExportGenerationPayload>, cancellationToken: CancellationToken): Promise<void> {
    const { userId, exportType, filters, format, deliveryMethod } = job.payload;

    this.logger.log(
      `Generating ${format} export for user ${userId} (type: ${exportType}, jobId: ${job.id}, attempt: ${job.attempts + 1}/${job.maxAttempts})`,
    );

    if (job.attempts > 0) {
      const backoffDelayMs = this.BACKOFF_DELAYS_MS[Math.min(job.attempts - 1, this.BACKOFF_DELAYS_MS.length - 1)];
      this.logger.log(
        `Retry attempt ${job.attempts} (next backoff delay: ${backoffDelayMs}ms, jobId: ${job.id})`,
      );
    }

    try {
      // Fetch data based on export type
      const records = await this.fetchExportData(userId, exportType, filters, cancellationToken);

      this.logger.log(
        `Fetched ${records.length} records for export (jobId: ${job.id})`,
      );

      // Generate export file
      const exportData = await this.generateExportFile(records, format, cancellationToken);

      this.logger.log(
        `Generated ${format} export (${exportData.length} bytes, jobId: ${job.id})`,
      );

      // Deliver export via specified method
      await this.deliverExport(job, exportData, format, deliveryMethod, cancellationToken);

      this.logger.log(
        `Export delivered successfully via ${deliveryMethod} (jobId: ${job.id})`,
      );
    } catch (error) {
      // Re-throw PermanentJobError as-is
      if (error instanceof PermanentJobError) {
        throw error;
      }

      // Other errors are transient (database errors, network errors, etc.)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const attemptCount = job.attempts + 1;

      this.logger.error(
        `Export generation failed (jobId: ${job.id}, attempt: ${attemptCount}/${job.maxAttempts}): ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // DLQ enrichment: log structured retry metadata on final failure
      if (attemptCount >= job.maxAttempts) {
        this.logger.error(
          `Export permanently failed — moving to DLQ (jobId: ${job.id}, userId: ${userId}, ` +
          `exportType: ${exportType}, attempts: ${attemptCount}, ` +
          `backoffDelays: ${this.BACKOFF_DELAYS_MS.join(',')})`,
        );
      }

      throw new Error(`Export generation failed: ${errorMessage}`);
    }
  }

  /**
   * Fetch export data from database
   * 
   * Queries the database based on exportType and filters.
   * Checks cancellation token every 1000 records.
   * 
   * @param userId - User ID requesting the export
   * @param exportType - Type of data to export
   * @param filters - Filters to apply to the query
   * @param cancellationToken - Token to check for cancellation
   * @returns Array of records to export
   */
  private async fetchExportData(
    userId: string,
    exportType: 'transactions' | 'links' | 'payments',
    filters: Record<string, unknown>,
    cancellationToken: CancellationToken,
  ): Promise<Record<string, unknown>[]> {
    // Check cancellation before starting
    cancellationToken.throwIfCancelled();

    const client = this.supabase.getClient();
    let query;

    // Build query based on export type
    switch (exportType) {
      case 'transactions':
        query = client
          .from('transactions')
          .select('*')
          .eq('user_id', userId);
        break;

      case 'links':
        query = client
          .from('links')
          .select('*')
          .eq('user_id', userId);
        break;

      case 'payments':
        query = client
          .from('payments')
          .select('*')
          .eq('user_id', userId);
        break;

      default:
        throw new PermanentJobError(`Unsupported export type: ${exportType}`);
    }

    // Apply filters
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    }

    // Execute query
    const { data, error } = await query;

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    // Check cancellation after fetching data
    cancellationToken.throwIfCancelled();

    return data || [];
  }

  /**
   * Generate export file in specified format
   * 
   * Converts records to CSV or JSON format.
   * Checks cancellation token every 1000 records.
   * 
   * @param records - Records to export
   * @param format - Output format (csv or json)
   * @param cancellationToken - Token to check for cancellation
   * @returns Export data as string
   */
  private async generateExportFile(
    records: Record<string, unknown>[],
    format: 'csv' | 'json',
    cancellationToken: CancellationToken,
  ): Promise<string> {
    if (format === 'json') {
      // JSON export is simple - just stringify
      cancellationToken.throwIfCancelled();
      return JSON.stringify(records, null, 2);
    }

    // CSV export - process in chunks
    if (records.length === 0) {
      return '';
    }

    const lines: string[] = [];

    // Add header row
    const headers = Object.keys(records[0]);
    lines.push(headers.map(h => this.escapeCsvValue(h)).join(','));

    // Add data rows, checking cancellation every 1000 records
    for (let i = 0; i < records.length; i++) {
      // Check cancellation every 1000 records
      if (i % this.cancellationCheckInterval === 0) {
        cancellationToken.throwIfCancelled();
      }

      const record = records[i];
      const values = headers.map(h => this.escapeCsvValue(String(record[h] ?? '')));
      lines.push(values.join(','));
    }

    return lines.join('\n');
  }

  /**
   * Escape CSV value (handle quotes, commas, newlines)
   */
  private escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Deliver export via specified method
   * 
   * Supports webhook, email, and download link delivery methods.
   * 
   * @param userId - User ID requesting the export
   * @param exportType - Type of export
   * @param exportData - Export data as string
   * @param format - Export format
   * @param deliveryMethod - How to deliver the export
   * @param cancellationToken - Token to check for cancellation
   */
  private async deliverExport(
    job: Job<ExportGenerationPayload>,
    exportData: string,
    format: 'csv' | 'json',
    deliveryMethod: 'webhook' | 'email' | 'download',
    cancellationToken: CancellationToken,
  ): Promise<void> {
    const { exportType } = job.payload;
    cancellationToken.throwIfCancelled();

    let result;
    switch (deliveryMethod) {
      case 'webhook':
        result = await this.webhookAdapter.deliver(job.payload, exportData, format);
        break;
      case 'email':
        result = await this.emailAdapter.deliver(job.payload, exportData, format);
        break;
      case 'download':
        result = await this.downloadAdapter.deliver(job.payload, exportData, format);
        break;
      default:
        throw new PermanentJobError(`Unsupported delivery method: ${deliveryMethod}`);
    }

    if (!result.success) {
      throw new Error(result.error ?? 'Export delivery failed');
    }

    this.logger.log(
      `Export delivered successfully via ${deliveryMethod} (url: ${result.deliveryUrl ?? 'n/a'}, jobId: ${job.id})`,
    );

    await this.notifyUserOfDelivery(job, exportType, format, deliveryMethod, result);
  }

  /**
   * Validate export generation payload
   * 
   * Checks that required fields are present:
   * - userId: User requesting the export
   * - exportType: Type of data to export
   * - format: Output format
   * - deliveryMethod: How to deliver the export
   * 
   * @param payload - The export generation payload
   * @throws PermanentJobError if validation fails
   * 
   * **Validates: Requirements 9.3, 15.4, 15.5**
   */
  async validate(payload: ExportGenerationPayload): Promise<void> {
    const errors: string[] = [];

    if (!payload.userId || typeof payload.userId !== 'string') {
      errors.push('userId is required and must be a string');
    }

    if (!payload.exportType || !['transactions', 'links', 'payments'].includes(payload.exportType)) {
      errors.push('exportType is required and must be one of: transactions, links, payments');
    }

    if (!payload.format || !['csv', 'json'].includes(payload.format)) {
      errors.push('format is required and must be one of: csv, json');
    }

    if (!payload.deliveryMethod || !['webhook', 'email', 'download'].includes(payload.deliveryMethod)) {
      errors.push('deliveryMethod is required and must be one of: webhook, email, download');
    }

    if (payload.deliveryMethod === 'webhook' && !payload.webhookUrl) {
      errors.push('webhookUrl is required when deliveryMethod is webhook');
    }

    if (payload.deliveryMethod === 'email' && !payload.email) {
      errors.push('email is required when deliveryMethod is email');
    }

    if (!payload.filters || typeof payload.filters !== 'object') {
      errors.push('filters is required and must be an object');
    }

    if (errors.length > 0) {
      throw new PermanentJobError(`Validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Handle job failure
   * 
   * Logs export generation failure, sends user notification, and enriches DLQ
   * with structured failure details. This is called when the job exhausts all
   * retry attempts and moves to DLQ.
   * 
   * @param job - The failed job
   * @param error - The error that caused the failure
   * 
   * **Validates: Requirements 9.5**
   */
  async onFailure(job: Job<ExportGenerationPayload>, error: Error): Promise<void> {
    const { userId, exportType, format, deliveryMethod } = job.payload;
    const errorMessage = error.message;
    const attemptCount = job.attempts + 1;

    this.logger.error(
      `Export generation permanently failed for user ${userId} (type: ${exportType}, jobId: ${job.id}): ${errorMessage}`,
      error.stack,
    );

    // DLQ enrichment: structured failure details for debugging
    this.logger.error(
      `DLQ enrichment (jobId: ${job.id}): userId=${userId}, exportType=${exportType}, ` +
      `format=${format}, deliveryMethod=${deliveryMethod}, ` +
      `attempts=${attemptCount}/${job.maxAttempts}, backoffDelays=[${this.BACKOFF_DELAYS_MS.join(',')}], ` +
      `error=${errorMessage}`,
    );

    // Send notification to user about the failed export
    await this.notifyUserOfFailure(job, error, attemptCount);
  }

  /**
   * Notify the user that their export has permanently failed.
   * 
   * Attempts to send an in-app notification via the notification service.
   * Uses the user's public key derived from userId for notification delivery.
   * Failures in notification delivery are logged but do not re-throw.
   */
  private async notifyUserOfFailure(
    job: Job<ExportGenerationPayload>,
    error: Error,
    attemptCount: number,
  ): Promise<void> {
    const { userId, exportType, format, deliveryMethod } = job.payload;
    const errorMessage = error.message;

    try {
      const payload: ExportFailedPayload = {
        eventType: 'export.failure',
        eventId: `export-failed-${job.id}`,
        recipientPublicKey: userId,
        title: 'Export Failed',
        body:
          `Your ${format.toUpperCase()} export of ${exportType} data has failed after ` +
          `${attemptCount} attempt${attemptCount === 1 ? '' : 's'}. ` +
          `Error: ${errorMessage}`,
        occurredAt: new Date().toISOString(),
        exportType,
        format,
        deliveryMethod,
        errorMessage,
        attemptCount,
        permanent: true,
        metadata: {
          jobId: job.id,
          exportType,
          format,
          deliveryMethod,
          attempts: attemptCount,
          maxAttempts: job.maxAttempts,
        },
      };

      await this.notificationService.dispatch(payload);

      this.logger.log(
        `User notified of export failure (userId: ${userId}, jobId: ${job.id})`,
      );
    } catch (notificationError) {
      this.logger.error(
        `Failed to send export failure notification (userId: ${userId}, jobId: ${job.id}): ` +
        `${notificationError instanceof Error ? notificationError.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Notify the user that their export has been delivered successfully.
   */
  private async notifyUserOfDelivery(
    job: Job<ExportGenerationPayload>,
    exportType: string,
    format: string,
    deliveryMethod: string,
    result: { deliveryUrl?: string; metadata?: Record<string, unknown> },
  ): Promise<void> {
    const { userId } = job.payload;

    try {
      const payload: ExportDeliveredPayload = {
        eventType: 'export.delivered',
        eventId: `export-delivered-${job.id}`,
        recipientPublicKey: userId,
        title: 'Export Ready',
        body:
          `Your ${format.toUpperCase()} export of ${exportType} data is ready. ` +
          `Delivered via ${deliveryMethod}.`,
        occurredAt: new Date().toISOString(),
        exportType,
        format,
        deliveryMethod,
        deliveryUrl: result.deliveryUrl,
        exportSizeBytes: result.metadata?.exportSizeBytes as number | undefined,
        attemptCount: job.attempts + 1,
        metadata: {
          jobId: job.id,
          exportType,
          format,
          deliveryMethod,
          deliveryUrl: result.deliveryUrl,
          ...result.metadata,
        },
      };

      await this.notificationService.dispatch(payload);

      this.logger.log(
        `User notified of export delivery (userId: ${userId}, jobId: ${job.id})`,
      );
    } catch (notificationError) {
      this.logger.error(
        `Failed to send export delivery notification (userId: ${userId}, jobId: ${job.id}): ` +
        `${notificationError instanceof Error ? notificationError.message : 'Unknown error'}`,
      );
    }
  }
}
