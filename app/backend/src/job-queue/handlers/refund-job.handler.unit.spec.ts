/**
 * Refund Job Handler - Unit Tests
 * 
 * Tests for the RefundJobHandler that processes on-chain refund operations.
 * 
 * **Validates: BE-12 refund workflow**
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RefundJobHandler, PermanentRefundError } from './refund-job.handler';
import { Job, JobStatus, JobType, CancellationToken } from '../types';
import { RefundJobPayload } from '../types/job-payloads.types';
import { SupabaseService } from '../../supabase/supabase.service';
import { ContractRegistryService } from '../../contracts/contract-registry.service';
import { SorobanRpcService } from '../../transactions/soroban-rpc.service';
import { StellarSigningService } from '../../common/stellar-signing.service';

describe('RefundJobHandler', () => {
  let handler: RefundJobHandler;
  let supabaseService: jest.Mocked<SupabaseService>;
  let sorobanRpc: jest.Mocked<SorobanRpcService>;

  const mockPayload: RefundJobPayload = {
    refundId: 'refund-123',
    idempotencyKey: 'idem-key-456',
    entityType: 'escrow',
    entityId: 'escrow-789',
  };

  const mockJob: Job<RefundJobPayload> = {
    id: 'job-123',
    type: JobType.REFUND,
    payload: mockPayload,
    status: JobStatus.PENDING,
    attempts: 0,
    maxAttempts: 5,
    createdAt: new Date(),
    scheduledAt: new Date(),
    startedAt: null,
    completedAt: null,
    failureReason: null,
    visibilityTimeout: null,
  };

  const mockCancellationToken: CancellationToken = {
    isCancelled: jest.fn().mockReturnValue(false),
    throwIfCancelled: jest.fn(),
  };

  beforeEach(async () => {
    const mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
      update: jest.fn().mockReturnThis(),
    };

    const mockSupabaseService = {
      getClient: jest.fn().mockReturnValue(mockSupabaseClient),
    };

    const mockRegistry = {
      data: {
        RustAcademy: { id: 'CCD123456789ABCDEF' },
      },
    };

    const mockContractRegistry = {
      getRegistry: jest.fn().mockResolvedValue(mockRegistry),
    };

    const mockSorobanRpc = {
      getAccount: jest.fn().mockResolvedValue({
        accountId: 'G123456789',
        sequenceNumber: '123',
        publicKey: jest.fn().mockReturnValue('G123456789'),
      }),
      prepareTransaction: jest.fn().mockImplementation((tx) => tx),
      submitAndWait: jest.fn(),
      pollTransactionStatus: jest.fn(),
    };

    const mockSigningService = {
      publicKey: 'G123456789',
      isConfigured: true,
      signTransaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundJobHandler,
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: ContractRegistryService, useValue: mockContractRegistry },
        { provide: SorobanRpcService, useValue: mockSorobanRpc },
        { provide: StellarSigningService, useValue: mockSigningService },
      ],
    }).compile();

    handler = module.get<RefundJobHandler>(RefundJobHandler);
    supabaseService = module.get(SupabaseService) as jest.Mocked<SupabaseService>;
    sorobanRpc = module.get(SorobanRpcService) as jest.Mocked<SorobanRpcService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validate', () => {
    it('should pass validation with valid payload', async () => {
      await expect(handler.validate(mockPayload)).resolves.not.toThrow();
    });

    it('should throw PermanentRefundError for missing refundId', async () => {
      const invalidPayload = { ...mockPayload, refundId: '' };

      await expect(handler.validate(invalidPayload)).rejects.toThrow(PermanentRefundError);
      await expect(handler.validate(invalidPayload)).rejects.toThrow('refundId is required');
    });

    it('should throw PermanentRefundError for missing idempotencyKey', async () => {
      const invalidPayload = { ...mockPayload, idempotencyKey: '' };

      await expect(handler.validate(invalidPayload)).rejects.toThrow(PermanentRefundError);
      await expect(handler.validate(invalidPayload)).rejects.toThrow('idempotencyKey is required');
    });

    it('should throw PermanentRefundError for missing entityType', async () => {
      const invalidPayload = { ...mockPayload, entityType: '' as unknown as RefundJobPayload['entityType'] };

      await expect(handler.validate(invalidPayload)).rejects.toThrow(PermanentRefundError);
      await expect(handler.validate(invalidPayload)).rejects.toThrow('entityType is required');
    });

    it('should throw PermanentRefundError for missing entityId', async () => {
      const invalidPayload = { ...mockPayload, entityId: '' };

      await expect(handler.validate(invalidPayload)).rejects.toThrow(PermanentRefundError);
      await expect(handler.validate(invalidPayload)).rejects.toThrow('entityId is required');
    });
  });

  describe('execute', () => {
    it('should process refund successfully when transaction succeeds', async () => {
      const mockClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null }),
        update: jest.fn().mockReturnThis(),
      };
      
      // Override the client returned by supabaseService
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockClient);
      supabaseService.getClient.mockReturnValue(mockClient);

      sorobanRpc.submitAndWait.mockResolvedValue({
        status: 'SUCCESS',
        hash: 'tx-hash-abc123',
      });

      // Mock getEntityInfo to return commitment
      const existingRecordMock = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { commitment: 'deadbeef'.repeat(8) },
        }),
      };
      mockClient.from.mockImplementation((table: string) => {
        if (table === 'refund_attempts') {
          return mockClient;
        }
        if (table === 'escrow_records') {
          return existingRecordMock;
        }
        return mockClient;
      });

      await handler.execute(mockJob, mockCancellationToken);

      expect(sorobanRpc.submitAndWait).toHaveBeenCalled();
      expect(mockClient.update).toHaveBeenCalled();
    });

    it('should update refund as failed when transaction fails', async () => {
      const mockClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null }),
        update: jest.fn().mockReturnThis(),
      };
      
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockClient);
      supabaseService.getClient.mockReturnValue(mockClient);

      sorobanRpc.submitAndWait.mockResolvedValue({
        status: 'FAILED',
        hash: 'tx-hash-abc123',
        errorCode: 'SOROBAN_CONTRACT_ERROR',
        errorMessage: 'Contract execution failed',
      });

      // Mock getEntityInfo to return commitment
      const existingRecordMock = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { commitment: 'deadbeef'.repeat(8) },
        }),
      };
      mockClient.from.mockImplementation((table: string) => {
        if (table === 'refund_attempts') {
          return mockClient;
        }
        if (table === 'escrow_records') {
          return existingRecordMock;
        }
        return mockClient;
      });

      await expect(handler.execute(mockJob, mockCancellationToken)).rejects.toThrow();

      expect(sorobanRpc.submitAndWait).toHaveBeenCalled();
    });

    it('should throw PermanentRefundError for non-retryable failures', async () => {
      const mockClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null }),
        update: jest.fn().mockReturnThis(),
      };
      
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockClient);
      supabaseService.getClient.mockReturnValue(mockClient);

      sorobanRpc.submitAndWait.mockResolvedValue({
        status: 'FAILED',
        hash: 'tx-hash-abc123',
        errorCode: 'SOROBAN_CONTRACT_ERROR',
        errorMessage: 'contract_escrow_already_settled',
      });

      // Mock getEntityInfo to return commitment
      const existingRecordMock = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { commitment: 'deadbeef'.repeat(8) },
        }),
      };
      mockClient.from.mockImplementation((table: string) => {
        if (table === 'refund_attempts') {
          return mockClient;
        }
        if (table === 'escrow_records') {
          return existingRecordMock;
        }
        return mockClient;
      });

      await expect(handler.execute(mockJob, mockCancellationToken)).rejects.toThrow(PermanentRefundError);
    });

    it('should check existing transaction hash before submitting', async () => {
      const mockClient = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            on_chain_tx_hash: 'existing-tx-hash',
            contract_id: 'CCD123',
            retry_count: 0,
            is_retryable: true,
          },
        }),
        update: jest.fn().mockReturnThis(),
      };
      
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockClient);
      supabaseService.getClient.mockReturnValue(mockClient);

      sorobanRpc.pollTransactionStatus.mockResolvedValue({
        status: 'SUCCESS',
        hash: 'existing-tx-hash',
      });

      await handler.execute(mockJob, mockCancellationToken);

      expect(sorobanRpc.pollTransactionStatus).toHaveBeenCalledWith('existing-tx-hash');
      expect(sorobanRpc.submitAndWait).not.toHaveBeenCalled();
    });
  });

  describe('onFailure', () => {
    it('should update refund status to failed with is_retryable false', async () => {
      const mockClient = {
        from: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };
      (supabaseService.getClient as jest.Mock).mockReturnValue(mockClient);

      await handler.onFailure(mockJob, new Error('Permanent failure'));

      expect(mockClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          is_retryable: false,
        })
      );
    });
  });
});