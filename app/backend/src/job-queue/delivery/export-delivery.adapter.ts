import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import type { ExportGenerationPayload } from '../types/job-payloads.types';

/**
 * Result of a delivery attempt
 */
export interface ExportDeliveryResult {
  success: boolean;
  deliveryUrl?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Export delivery adapter interface
 *
 * Each adapter implements a specific delivery method:
 * - WebhookDeliveryAdapter: POST export to a webhook URL
 * - EmailDeliveryAdapter: Send export as email attachment via SendGrid
 * - DownloadLinkAdapter: Store in Supabase Storage and return a signed download URL
 */
export interface IExportDeliveryAdapter {
  readonly method: 'webhook' | 'email' | 'download';
  deliver(
    payload: ExportGenerationPayload,
    exportData: string,
    format: 'csv' | 'json',
  ): Promise<ExportDeliveryResult>;
}

/**
 * Base class providing common utilities for export delivery adapters
 */
@Injectable()
export abstract class BaseExportDeliveryAdapter implements IExportDeliveryAdapter {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly supabase: SupabaseService,
  ) {}

  abstract readonly method: 'webhook' | 'email' | 'download';

  abstract deliver(
    payload: ExportGenerationPayload,
    exportData: string,
    format: 'csv' | 'json',
  ): Promise<ExportDeliveryResult>;
}
