/**
 * EmailDeliveryAdapter - Unit Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../../supabase/supabase.service';
import { EmailDeliveryAdapter } from '../email-delivery.adapter';
import type { ExportGenerationPayload } from '../../../job-queue/types/job-payloads.types';

describe('EmailDeliveryAdapter', () => {
  let adapter: EmailDeliveryAdapter;

  const mockPayload: ExportGenerationPayload = {
    userId: 'user-123',
    exportType: 'transactions',
    filters: {},
    format: 'csv',
    deliveryMethod: 'email',
    email: 'user@example.com',
  };

  beforeEach(async () => {
    process.env['SENDGRID_API_KEY'] = 'test-sendgrid-key';
    process.env['SENDGRID_FROM_EMAIL'] = 'noreply@example.com';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailDeliveryAdapter,
        { provide: SupabaseService, useValue: { getClient: jest.fn() } },
      ],
    }).compile();

    adapter = module.get<EmailDeliveryAdapter>(EmailDeliveryAdapter);
    supabase = module.get(SupabaseService) as jest.Mocked<SupabaseService>;
  });

  afterEach(() => {
    delete process.env['SENDGRID_API_KEY'];
    delete process.env['SENDGRID_FROM_EMAIL'];
  });

  describe('deliver', () => {
    it('should return failure when SendGrid is not configured', async () => {
      delete process.env['SENDGRID_API_KEY'];
      const result = await adapter.deliver(mockPayload, 'export-data', 'csv');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not configured');
    });

    it('should return failure when recipient email is missing', async () => {
      const result = await adapter.deliver(
        { ...mockPayload, email: undefined },
        'export-data',
        'csv',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No recipient email');
    });

    it('should successfully send email on 2xx response', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 202,
        headers: new Map([['X-Message-Id', 'msg-123']]),
        text: jest.fn().mockResolvedValue(''),
      } as unknown as Response);

      const result = await adapter.deliver(mockPayload, 'export-data', 'csv');

      expect(result.success).toBe(true);
      expect(result.metadata?.messageId).toBe('msg-123');
    });

    it('should return failure on SendGrid error', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('Bad request'),
      } as unknown as Response);

      const result = await adapter.deliver(mockPayload, 'export-data', 'csv');

      expect(result.success).toBe(false);
      expect(result.error).toContain('SendGrid error 400');
    });
  });
});
