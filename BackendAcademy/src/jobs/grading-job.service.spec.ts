import { GradingJobService } from './grading-job.service';
import { GradingJobEntity, GradingJobStatus } from './entities/grading-job.entity';

describe('GradingJobService retries', () => {
  let service: GradingJobService;
  let mockRepo: any;
  let mockGradingResultService: any;

  beforeEach(() => {
    mockRepo = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => v),
      find: jest.fn(async () => []),
    };

    let call = 0;
    mockGradingResultService = {
      saveResult: jest.fn(async () => {
        call += 1;
        if (call === 1) throw new Error('transient');
        return {};
      }),
    };

    service = new GradingJobService(mockRepo, mockGradingResultService);
  });

  it('retries a failed job and marks completed on success', async () => {
    const job: GradingJobEntity = {
      id: '1',
      submissionId: 'sub-1',
      payload: { foo: 'bar' },
      attempts: 0,
      maxAttempts: 3,
      lastError: null,
      nextRetryAt: new Date(Date.now() - 1000),
      status: GradingJobStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    mockRepo.find.mockResolvedValue([job]);

    await service.processOnce();

    // After first pass the job should have been saved with attempts=1 and status PENDING
    expect(mockRepo.save).toHaveBeenCalled();
    const savedAfterFirst = mockRepo.save.mock.calls[0][0];
    expect(savedAfterFirst.attempts).toBe(1);
    expect(savedAfterFirst.status).toBe(GradingJobStatus.PENDING);

    // simulate that find returns the job again for second pass
    // ensure nextRetryAt is in the past so the retry will execute immediately
    savedAfterFirst.nextRetryAt = new Date(Date.now() - 1000);
    mockRepo.find.mockResolvedValue([savedAfterFirst]);
    await service.processOnce();

    // final save should mark COMPLETED
    const finalSaved = mockRepo.save.mock.calls[mockRepo.save.mock.calls.length - 1][0];
    expect(finalSaved.status).toBe(GradingJobStatus.COMPLETED);
  });
});
