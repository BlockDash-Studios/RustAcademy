import { Test, TestingModule } from '@nestjs/testing';
import { JobQueueService } from '../src/job-queue/job-queue.service';
import { JobRepository } from '../src/job-queue/job.repository';
import { JobRegistry } from '../src/job-queue/job-registry.service';
import { CancellationStore } from '../src/job-queue/cancellation-token';
import { JobQueueMetricsService } from '../src/job-queue/job-queue-metrics.service';
import { SupabaseService } from '../src/supabase/supabase.service';
import { JobType } from '../src/job-queue/types/job.types';

interface MockJobRow {
  id: string;
  type: string;
  payload: unknown;
  status: string;
  attempts: number;
  max_attempts: number;
  created_at: string;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  failure_reason: string | null;
  visibility_timeout: string | null;
  idempotency_key: string | null;
  retry_metadata: Record<string, unknown> | null;
}

describe('Job Queue Integration & Idempotency', () => {
  let service: JobQueueService;
  let repository: JobRepository;
  let registry: JobRegistry;

  const mockJobsStore = new Map<string, MockJobRow>();
  const mockIdempotencyStore = new Map<string, MockJobRow>();

  beforeEach(async () => {
    mockJobsStore.clear();
    mockIdempotencyStore.clear();

    const mockSupabase = {
      getClient: () => ({
        from: () => ({
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                const id = `job-${Date.now()}-${Math.random()}`;
                const jobRow: MockJobRow = {
                  id,
                  type: String(row.type),
                  payload: row.payload,
                  status: String(row.status),
                  attempts: Number(row.attempts),
                  max_attempts: Number(row.max_attempts),
                  created_at: new Date().toISOString(),
                  scheduled_at: String(row.scheduled_at),
                  started_at: null,
                  completed_at: null,
                  failure_reason: null,
                  visibility_timeout: null,
                  idempotency_key: (row.idempotency_key as string) || null,
                  retry_metadata: (row.retry_metadata as Record<string, unknown>) || null,
                };
                mockJobsStore.set(id, jobRow);
                if (row.idempotency_key) {
                  mockIdempotencyStore.set(row.idempotency_key as string, jobRow);
                }
                return { data: jobRow, error: null };
              },
            }),
          }),
          select: () => ({
            eq: (col: string, val: unknown) => ({
              maybeSingle: async () => {
                if (col === 'id') {
                  const job = mockJobsStore.get(String(val));
                  return { data: job || null, error: job ? null : { code: 'PGRST116' } };
                }
                if (col === 'idempotency_key') {
                  const job = mockIdempotencyStore.get(String(val));
                  return { data: job || null, error: job ? null : { code: 'PGRST116' } };
                }
                return { data: null, error: null };
              },
            }),
          }),
        }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobQueueService,
        JobRepository,
        JobRegistry,
        CancellationStore,
        {
          provide: JobQueueMetricsService,
          useValue: {
            incrementJobsEnqueued: jest.fn(),
            updateJobsPendingCount: jest.fn(),
            incrementJobsCancelled: jest.fn(),
          },
        },
        { provide: SupabaseService, useValue: mockSupabase },
      ],
    }).compile();

    service = module.get<JobQueueService>(JobQueueService);
    repository = module.get<JobRepository>(JobRepository);
    registry = module.get<JobRegistry>(JobRegistry);

    // Register a test job handler
    registry.registerHandler({
      type: JobType.EXPORT_GENERATION,
      handler: {
        execute: jest.fn().mockResolvedValue(undefined),
        validate: jest.fn().mockResolvedValue(undefined),
        onFailure: jest.fn().mockResolvedValue(undefined),
      },
      policy: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        visibilityTimeoutMs: 60000,
      },
    });
  });

  it('should enqueue job successfully and return unique ID', async () => {
    const jobId = await service.enqueue(JobType.EXPORT_GENERATION, { exportId: 'exp-123' });
    expect(jobId).toBeDefined();
    expect(typeof jobId).toBe('string');
  });

  it('should suppress duplicate job submissions when matching idempotencyKey is supplied', async () => {
    const idempotencyKey = 'export-key-999';

    const jobId1 = await service.enqueue(
      JobType.EXPORT_GENERATION,
      { exportId: 'exp-123' },
      idempotencyKey,
    );

    const jobId2 = await service.enqueue(
      JobType.EXPORT_GENERATION,
      { exportId: 'exp-123' },
      idempotencyKey,
    );

    expect(jobId1).toEqual(jobId2);
    expect(mockJobsStore.size).toBe(1);
  });

  it('should store and retrieve structured retry metadata on job record', async () => {
    const retryMetadata = {
      attemptCount: 2,
      lastError: 'Network timeout connecting to export storage provider',
      lastFailureAt: new Date().toISOString(),
      nextBackoffDelayMs: 5000,
      inDlq: false,
    };

    const job = await repository.createJob(
      JobType.EXPORT_GENERATION,
      { exportId: 'exp-456' },
      3,
      new Date(),
      'idem-key-777',
      retryMetadata,
    );

    expect(job.idempotencyKey).toBe('idem-key-777');
    expect(job.retryMetadata).toEqual(retryMetadata);
  });
});
