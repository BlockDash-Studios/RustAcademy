import { SubmissionProtectionService, SubmissionRateLimitException } from './submission-protection.service';

describe('SubmissionProtectionService', () => {
  beforeEach(() => {
    delete process.env.REDIS_REST_URL;
    delete process.env.REDIS_REST_TOKEN;
    process.env.SUBMISSION_RATE_LIMIT = '2';
    process.env.SUBMISSION_RATE_WINDOW_SECONDS = '60';
    process.env.SUBMISSION_DUPLICATE_WINDOW_SECONDS = '30';
  });

  afterEach(() => {
    delete process.env.SUBMISSION_RATE_LIMIT;
    delete process.env.SUBMISSION_RATE_WINDOW_SECONDS;
    delete process.env.SUBMISSION_DUPLICATE_WINDOW_SECONDS;
  });

  it('limits each user and reports the retry delay', async () => {
    const service = new SubmissionProtectionService();
    const input = {
      userId: 'learner-1',
      clientIp: '192.0.2.1',
      challengeId: 'week-1',
      action: () => 'accepted',
    };

    await service.protect({ ...input, submissionId: 'one' });
    await service.protect({ ...input, submissionId: 'two' });
    await expect(service.protect({ ...input, submissionId: 'three' })).rejects.toBeInstanceOf(
      SubmissionRateLimitException,
    );
  });

  it('rejects duplicate submissions during the duplicate window', async () => {
    const service = new SubmissionProtectionService();
    const input = {
      userId: 'learner-1',
      clientIp: '192.0.2.2',
      challengeId: 'week-2',
      submissionId: 'same-submission',
      action: () => 'accepted',
    };

    await expect(service.protect(input)).resolves.toBe('accepted');
    await expect(service.protect(input)).rejects.toThrow('Duplicate submission detected');
  });
});