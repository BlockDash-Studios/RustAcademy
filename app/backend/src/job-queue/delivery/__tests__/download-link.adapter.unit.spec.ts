/**
 * DownloadLinkAdapter - Unit Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../../supabase/supabase.service';
import { AppConfigService } from '../../../config/app-config.service';
import { DownloadLinkAdapter } from '../download-link.adapter';
import type { ExportGenerationPayload } from '../../../job-queue/types/job-payloads.types';

describe('DownloadLinkAdapter', () => {
  let adapter: DownloadLinkAdapter;
  let supabase: jest.Mocked<SupabaseService>;
  let config: jest.Mocked<AppConfigService>;

  const mockPayload: ExportGenerationPayload = {
    userId: 'user-123',
    exportType: 'transactions',
    filters: {},
    format: 'csv',
    deliveryMethod: 'download',
  };

  beforeEach(async () => {
    supabase = {
      getClient: jest.fn(),
    } as unknown as jest.Mocked<SupabaseService>;

    config = {
      exportStorageBucket: 'exports',
      exportLinkExpiryMs: 604_800_000,
      appBaseUrl: 'https://app.example.com',
    } as unknown as jest.Mocked<AppConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DownloadLinkAdapter,
        { provide: SupabaseService, useValue: supabase },
        { provide: AppConfigService, useValue: config },
      ],
    }).compile();

    adapter = module.get<DownloadLinkAdapter>(DownloadLinkAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('deliver', () => {
    it('should return failure when storage bucket is not configured', async () => {
      (config as unknown as { exportStorageBucket?: string }).exportStorageBucket = undefined;

      const result = await adapter.deliver(mockPayload, 'export-data', 'csv');

      expect(result.success).toBe(false);
      expect(result.error).toContain('EXPORT_STORAGE_BUCKET is not configured');
    });

    it('should upload file and return signed URL on success', async () => {
      const mockStorage = {
        from: jest.fn().mockReturnThis(),
        upload: jest.fn().mockResolvedValue({ error: null }),
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://example.com/download/xyz' },
          error: null,
        }),
      };

      (supabase.getClient as jest.Mock).mockReturnValue({
        storage: mockStorage,
      } as unknown as ReturnType<SupabaseService['getClient']>);

      const result = await adapter.deliver(mockPayload, 'export-data', 'csv');

      expect(mockStorage.upload).toHaveBeenCalled();
      expect(mockStorage.createSignedUrl).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.deliveryUrl).toBe('https://example.com/download/xyz');
    });

    it('should return failure when upload fails', async () => {
      const mockStorage = {
        from: jest.fn().mockReturnThis(),
        upload: jest.fn().mockResolvedValue({ error: { message: 'Upload failed' } }),
        createSignedUrl: jest.fn(),
      };

      (supabase.getClient as jest.Mock).mockReturnValue({
        storage: mockStorage,
      } as unknown as ReturnType<SupabaseService['getClient']>);

      const result = await adapter.deliver(mockPayload, 'export-data', 'csv');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Supabase Storage upload failed');
    });
  });
});
