import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService, WebhookPayload } from './payments.service';
import { DatabaseService } from '../database/database.service';
import { TransactionManagerService } from '../common/transaction-manager.service';

// Note: jest.config sets resetMocks: true, so implementations must be
// (re)assigned in beforeEach rather than at module scope.
const okDeliverFn = jest.fn();
const failDeliverFn = jest.fn();

function makeWebhook(overrides: Partial<WebhookPayload> = {}): WebhookPayload {
  return {
    id: 'wh-1',
    url: 'https://example.com/hook',
    body: '{"event":"payment.succeeded"}',
    signature: 'sig-abc',
    idempotencyKey: 'idem-wh-1',
    maxRetries: 3,
    ...overrides,
  };
}

describe('PaymentsService — durable webhook outbox (Issue #666 / BA-098)', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    okDeliverFn.mockImplementation(async () => 200);
    failDeliverFn.mockImplementation(async () => 500);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: DatabaseService, useValue: new DatabaseService(new TransactionManagerService()) },
      ],
    }).compile();
    service = module.get<PaymentsService>(PaymentsService);
  });

  it('persists outbound events before delivery', async () => {
    await service.enqueueWebhook(makeWebhook());
    const record = await service.getWebhookDeliveryRecord('wh-1');
    expect(record).toMatchObject({ id: 'wh-1', status: 'pending', attempts: 0, url: 'https://example.com/hook' });
  });

  it('delivers due webhooks and records the success durably', async () => {
    await service.enqueueWebhook(makeWebhook());
    const processed = await service.deliverDueWebhooks(okDeliverFn);

    expect(okDeliverFn).toHaveBeenCalledWith(
      'https://example.com/hook',
      '{"event":"payment.succeeded"}',
      expect.objectContaining({
        'X-Webhook-Signature': 'sig-abc',
        'X-Idempotency-Key': 'idem-wh-1',
        'X-Webhook-Attempt': '1',
      }),
    );
    expect(processed[0].status).toBe('delivered');
    expect(processed[0].attempts).toBe(1);

    const record = await service.getWebhookDeliveryRecord('wh-1');
    expect(record?.status).toBe('delivered');
    expect(record?.deliveredAt).toBeInstanceOf(Date);
  });

  it('reschedules failures and resumes delivery from the outbox', async () => {
    await service.enqueueWebhook(makeWebhook());
    const first = await service.deliverDueWebhooks(failDeliverFn);
    expect(first[0].status).toBe('retrying');
    expect(first[0].nextRetryAt).toBeInstanceOf(Date);
    expect(first[0].lastError).toBe('HTTP 500');

    // Simulate the retry window elapsing, then resume.
    const record = (await service.getWebhookDeliveryRecord('wh-1'))!;
    record.nextRetryAt = new Date(Date.now() - 1);
    record.status = 'retrying';

    const second = await service.deliverDueWebhooks(okDeliverFn);
    expect(second[0].status).toBe('delivered');
    expect(second[0].attempts).toBe(2);
  });

  it('marks terminal failures as inspectable once retries are exhausted', async () => {
    const webhook = makeWebhook({ maxRetries: 1 });
    await service.enqueueWebhook(webhook);
    const result = await service.deliverDueWebhooks(failDeliverFn);

    expect(result[0].status).toBe('failed');
    expect(result[0].terminalAt).toBeInstanceOf(Date);

    const failures = await service.getTerminalWebhookFailures();
    expect(failures.map((r) => r.id)).toEqual(['wh-1']);
    expect(failures[0].lastError).toBe('HTTP 500');
  });

  it('deliverWebhookWithRetry returns a durable success result', async () => {
    const result = await service.deliverWebhookWithRetry(makeWebhook(), okDeliverFn);
    expect(result).toEqual({ success: true, attempts: 1 });
    const record = await service.getWebhookDeliveryRecord('wh-1');
    expect(record?.status).toBe('delivered');
  });

  it('deliverWebhookWithRetry reports an inspectable terminal failure', async () => {
    const result = await service.deliverWebhookWithRetry(makeWebhook({ maxRetries: 2 }), failDeliverFn);
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(2);
    expect(result.lastError).toBe('HTTP 500');
    const failures = await service.getTerminalWebhookFailures();
    expect(failures).toHaveLength(1);
  });
});

describe('PaymentsService — payment webhook processing (regression)', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: DatabaseService, useValue: new DatabaseService(new TransactionManagerService()) },
      ],
    }).compile();
    service = module.get<PaymentsService>(PaymentsService);
  });

  it('applies a valid succeeded callback', async () => {
    const result = await service.processPaymentWebhookEvent({
      eventId: 'evt-1',
      paymentId: 'pay-1',
      orderId: 'ord-1',
      userId: 'user-1',
      status: 'succeeded',
      amount: 100,
      assetCode: 'XLM',
      provider: 'stellar',
    });
    expect(result.outcome).toBe('applied');
  });

  it('recognises a duplicate event id as a no-op', async () => {
    const event = {
      eventId: 'evt-1',
      paymentId: 'pay-1',
      orderId: 'ord-1',
      userId: 'user-1',
      status: 'succeeded' as const,
      amount: 100,
      assetCode: 'XLM',
      provider: 'stellar',
    };
    await service.processPaymentWebhookEvent(event);
    const result = await service.processPaymentWebhookEvent(event);
    expect(result.outcome).toBe('duplicate');
  });

  it('rejects an illegal transition', async () => {
    const succeeded = {
      eventId: 'evt-1',
      paymentId: 'pay-1',
      orderId: 'ord-1',
      userId: 'user-1',
      status: 'succeeded' as const,
      amount: 100,
      assetCode: 'XLM',
      provider: 'stellar',
    };
    await service.processPaymentWebhookEvent(succeeded);
    const result = await service.processPaymentWebhookEvent({
      ...succeeded,
      eventId: 'evt-2',
      status: 'pending',
    });
    expect(result.outcome).toBe('rejected');
  });
});
