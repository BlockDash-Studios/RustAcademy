/**
 * WebhookDeliveryAdapter - Unit Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../../supabase/supabase.service';
import { WebhookDeliveryAdapter } from '../webhook-delivery.adapter';
import type { ExportGenerationPayload } from '../../../job-queue/types/job-payloads.types';

describe('WebhookDeliveryAdapter', () => {
  let adapter: WebhookDeliveryAdapter;

  const mockPayload: ExportGenerationPayload = {
    userId: 'user-123',
    exportType: 'transactions',
    filters: {},
    format: 'csv',
    deliveryMethod: 'webhook',
    webhookUrl: 'https://example.com/export-hook',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookDeliveryAdapter,
        { provide: SupabaseService, useValue: { getClient: jest.fn() } },
      ],
    }).compile();

    adapter = module.get<WebhookDeliveryAdapter>(WebhookDeliveryAdapter);
    supabase = module.get(SupabaseService) as jest.Mocked<SupabaseService>;
  });

  describe('deliver', () => {
    it('should return failure when webhookUrl is missing', async () => {
      const result = await adapter.deliver(
        { ...mockPayload, webhookUrl: undefined },
        'export-data',
        'csv',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No webhook URL configured');
    });

    it('should successfully deliver to webhook on 2xx response', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('ok'),
      } as unknown as Response);

      const result = await adapter.deliver(mockPayload, 'export-data', 'csv');

      expect(result.success).toBe(true);
      expect(result.deliveryUrl).toBe(mockPayload.webhookUrl);
    });

    it('should return failure on non-2xx response', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Server error'),
      } as unknown as Response);

      const result = await adapter.deliver(mockPayload, 'export-data', 'csv');

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });
  });
});
