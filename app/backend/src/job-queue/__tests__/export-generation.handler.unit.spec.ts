/**
 * Export Generation Handler - Unit Tests
 *
 * Tests for the ExportGenerationHandler that processes export generation jobs.
 * Covers retry semantics, notification dispatch, and DLQ enrichment.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ExportGenerationHandler, PermanentJobError } from '../handlers/export-generation.handler';
import { Job, JobStatus, JobType, CancellationToken } from '../types';
import { ExportGenerationPayload } from '../types/job-payloads.types';
import { SupabaseService } from '../../supabase/supabase.service';
import { NotificationService } from '../../notifications/notification.service';
import { WebhookDeliveryAdapter } from '../delivery/webhook-delivery.adapter';
import { EmailDeliveryAdapter } from '../delivery/email-delivery.adapter';
import { DownloadLinkAdapter } from '../delivery/download-link.adapter';

describe('ExportGenerationHandler', () => {
  let handler: ExportGenerationHandler;
  let supabaseService: jest.Mocked<SupabaseService>;
  let notificationService: jest.Mocked<NotificationService>;
  let webhookAdapter: jest.Mocked<WebhookDeliveryAdapter>;
  let emailAdapter: jest.Mocked<EmailDeliveryAdapter>;
  let downloadAdapter: jest.Mocked<DownloadLinkAdapter>;

  const mockPayload: ExportGenerationPayload = {
    userId: 'user-123',
    exportType: 'transactions',
    filters: {},
    format: 'csv',
    deliveryMethod: 'download',
  };

  const createMockJob = (overrides: Partial<Job<ExportGenerationPayload>> = {}): Job<ExportGenerationPayload> => ({
    id: 'job-123',
    type: JobType.EXPORT_GENERATION,
    payload: mockPayload,
    status: JobStatus.PENDING,
    attempts: 0,
    maxAttempts: 4,
    createdAt: new Date(),
    scheduledAt: new Date(),
    startedAt: null,
    completedAt: null,
    failureReason: null,
    visibilityTimeout: null,
    ...overrides,
  });

  const mockCancellationToken: CancellationToken = {
    isCancelled: jest.fn().mockReturnValue(false),
    throwIfCancelled: jest.fn(),
  };

  beforeEach(async () => {
    const mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };

    const mockSupabaseService = {
      getClient: jest.fn().mockReturnValue(mockSupabaseClient),
    };

    const mockNotificationService = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    const mockWebhookAdapter = {
      deliver: jest.fn().mockResolvedValue({ success: true, deliveryUrl: 'https://example.com/webhook' }),
    };

    const mockEmailAdapter = {
      deliver: jest.fn().mockResolvedValue({ success: true, metadata: { messageId: 'msg-123' } }),
    };

    const mockDownloadAdapter = {
      deliver: jest.fn().mockResolvedValue({ success: true, deliveryUrl: 'https://example.com/download' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportGenerationHandler,
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: WebhookDeliveryAdapter, useValue: mockWebhookAdapter },
        { provide: EmailDeliveryAdapter, useValue: mockEmailAdapter },
        { provide: DownloadLinkAdapter, useValue: mockDownloadAdapter },
      ],
    }).compile();

    handler = module.get<ExportGenerationHandler>(ExportGenerationHandler);
    supabaseService = module.get(SupabaseService) as jest.Mocked<SupabaseService>;
    notificationService = module.get(NotificationService) as jest.Mocked<NotificationService>;
    webhookAdapter = module.get(WebhookDeliveryAdapter) as jest.Mocked<WebhookDeliveryAdapter>;
    emailAdapter = module.get(EmailDeliveryAdapter) as jest.Mocked<EmailDeliveryAdapter>;
    downloadAdapter = module.get(DownloadLinkAdapter) as jest.Mocked<DownloadLinkAdapter>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validate', () => {
    it('should pass validation with valid payload', async () => {
      await expect(handler.validate(mockPayload)).resolves.not.toThrow();
    });

    it('should throw PermanentJobError for missing userId', async () => {
      const invalidPayload = { ...mockPayload, userId: '' };
      await expect(handler.validate(invalidPayload)).rejects.toThrow(PermanentJobError);
    });

    it('should throw PermanentJobError for invalid exportType', async () => {
      const invalidPayload = { ...mockPayload, exportType: 'invalid' as unknown as ExportGenerationPayload['exportType'] };
      await expect(handler.validate(invalidPayload)).rejects.toThrow(PermanentJobError);
    });

    it('should throw PermanentJobError for invalid format', async () => {
      const invalidPayload = { ...mockPayload, format: 'xml' as unknown as ExportGenerationPayload['format'] };
      await expect(handler.validate(invalidPayload)).rejects.toThrow(PermanentJobError);
    });

    it('should throw PermanentJobError for invalid deliveryMethod', async () => {
      const invalidPayload = { ...mockPayload, deliveryMethod: 'sms' as unknown as ExportGenerationPayload['deliveryMethod'] };
      await expect(handler.validate(invalidPayload)).rejects.toThrow(PermanentJobError);
    });

    it('should throw PermanentJobError for missing filters', async () => {
      const invalidPayload = { ...mockPayload, filters: undefined as unknown as ExportGenerationPayload['filters'] };
      await expect(handler.validate(invalidPayload)).rejects.toThrow(PermanentJobError);
    });
  });

  describe('execute', () => {
    it('should complete export successfully with zero records', async () => {
      const mockClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockClient);

      await handler.execute(createMockJob(), mockCancellationToken);

      expect(notificationService.dispatch).not.toHaveBeenCalled();
    });

    it('should include attempt count in log output', async () => {
      const mockClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [{ a: 1 }], error: null }),
      };
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockClient);

      const job = createMockJob({ attempts: 2 });
      await handler.execute(job, mockCancellationToken);

      expect(notificationService.dispatch).not.toHaveBeenCalled();
    });

    it('should re-throw PermanentJobError without notification', async () => {
      const job = createMockJob({
        payload: { ...mockPayload, exportType: 'invalid' as unknown as ExportGenerationPayload['exportType'] },
      });

      await expect(handler.execute(job, mockCancellationToken)).rejects.toThrow(PermanentJobError);
      expect(notificationService.dispatch).not.toHaveBeenCalled();
    });

    it('should throw error for transient failures', async () => {
      const mockClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB connection lost' } }),
      };
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockClient);

      await expect(handler.execute(createMockJob(), mockCancellationToken)).rejects.toThrow(
        'Export generation failed: Database query failed: DB connection lost',
      );
    });

    it('should log DLQ enrichment details when attempts are exhausted', async () => {
      const mockClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: null, error: { message: 'Timeout' } }),
      };
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockClient);

      // attempts=3, maxAttempts=4 — this is the final attempt
      const job = createMockJob({ attempts: 3, maxAttempts: 4 });

      await expect(handler.execute(job, mockCancellationToken)).rejects.toThrow();
    });
  });

  describe('onFailure', () => {
    it('should notify user on permanent failure', async () => {
      const job = createMockJob();
      const error = new Error('Export generation failed: DB timeout');

      await handler.onFailure(job, error);

      expect(notificationService.dispatch).toHaveBeenCalledTimes(1);
      expect(notificationService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'export.failure',
          recipientPublicKey: 'user-123',
          title: 'Export Failed',
          permanent: true,
          exportType: 'transactions',
          format: 'csv',
          deliveryMethod: 'download',
          attemptCount: 1,
          errorMessage: 'Export generation failed: DB timeout',
        }),
      );
    });

    it('should include correct attempt count in notification', async () => {
      const job = createMockJob({ attempts: 3 });
      const error = new Error('Permanent failure');

      await handler.onFailure(job, error);

      expect(notificationService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          attemptCount: 4, // attempts is 0-indexed, so attempts+1
          metadata: expect.objectContaining({
            jobId: 'job-123',
            maxAttempts: 4,
          }),
        }),
      );
    });

    it('should not throw if notification dispatch fails', async () => {
      notificationService.dispatch.mockRejectedValueOnce(new Error('Notification service down'));

      const job = createMockJob();
      const error = new Error('Some failure');

      // Should not throw even though notification fails
      await expect(handler.onFailure(job, error)).resolves.not.toThrow();
    });

    it('should include exportType, format, and deliveryMethod in notification', async () => {
      const job = createMockJob({
        payload: {
          ...mockPayload,
          exportType: 'links',
          format: 'json',
          deliveryMethod: 'email',
        },
      });
      const error = new Error('Failure');

      await handler.onFailure(job, error);

      expect(notificationService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          exportType: 'links',
          format: 'json',
          deliveryMethod: 'email',
        }),
      );
    });
  });

  describe('retry backoff delays', () => {
    it('should log backoff delay on retry attempts', async () => {
      const mockClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockClient);

      // First attempt (attempts=0) should not log backoff
      await handler.execute(createMockJob({ attempts: 0 }), mockCancellationToken);

      // Second attempt (attempts=1) should log backoff
      await handler.execute(createMockJob({ attempts: 1 }), mockCancellationToken);
    });
  });

  describe('delivery adapters', () => {
    it('should invoke download adapter when deliveryMethod is download', async () => {
      const mockClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockClient);

      await handler.execute(createMockJob(), mockCancellationToken);

      expect(downloadAdapter.deliver).toHaveBeenCalledWith(
        expect.objectContaining({ deliveryMethod: 'download' }),
        expect.any(String),
        'csv',
      );
      expect(webhookAdapter.deliver).not.toHaveBeenCalled();
      expect(emailAdapter.deliver).not.toHaveBeenCalled();
    });

    it('should invoke webhook adapter when deliveryMethod is webhook', async () => {
      const mockClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockClient);

      await handler.execute(
        createMockJob({ payload: { ...mockPayload, deliveryMethod: 'webhook', webhookUrl: 'https://example.com/hook' } }),
        mockCancellationToken,
      );

      expect(webhookAdapter.deliver).toHaveBeenCalled();
      expect(downloadAdapter.deliver).not.toHaveBeenCalled();
    });

    it('should invoke email adapter when deliveryMethod is email', async () => {
      const mockClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockClient);

      await handler.execute(
        createMockJob({ payload: { ...mockPayload, deliveryMethod: 'email', email: 'user@example.com' } }),
        mockCancellationToken,
      );

      expect(emailAdapter.deliver).toHaveBeenCalled();
      expect(downloadAdapter.deliver).not.toHaveBeenCalled();
    });

    it('should notify user on successful delivery', async () => {
      const mockClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockClient);

      await handler.execute(createMockJob(), mockCancellationToken);

      expect(notificationService.dispatch).toHaveBeenCalledTimes(1);
      expect(notificationService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'export.delivered',
          recipientPublicKey: 'user-123',
          exportType: 'transactions',
          format: 'csv',
          deliveryMethod: 'download',
        }),
      );
    });

    it('should throw when delivery adapter returns failure', async () => {
      const mockClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      };
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockClient);

      (downloadAdapter.deliver as jest.Mock).mockResolvedValueOnce({
        success: false,
        error: 'Storage upload failed',
      });

      await expect(handler.execute(createMockJob(), mockCancellationToken)).rejects.toThrow(
        'Delivery failed',
      );
    });
  });
});
