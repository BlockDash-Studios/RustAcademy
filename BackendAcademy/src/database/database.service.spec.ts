import { DatabaseService } from './database.service';
import { TransactionManagerService } from '../common/transaction-manager.service';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('DatabaseService — durable webhook idempotency (Issue #663 / BA-095)', () => {
  let db: DatabaseService;

  beforeEach(() => {
    db = new DatabaseService(new TransactionManagerService());
  });

  it('claims an unknown key', async () => {
    const claim = await db.claimWebhookIdempotency('key-1', 'fp-1');
    expect(claim.claimed).toBe(true);
    if (claim.claimed) {
      expect(claim.record.status).toBe('in_progress');
    }
  });

  it('rejects a second claim of the same key and fingerprint while in progress', async () => {
    await db.claimWebhookIdempotency('key-1', 'fp-1');
    const claim = await db.claimWebhookIdempotency('key-1', 'fp-1');
    expect(claim).toMatchObject({ claimed: false, reason: 'already_in_progress' });
  });

  it('rejects a completed key as already_processed', async () => {
    await db.claimWebhookIdempotency('key-1', 'fp-1');
    await db.completeWebhookIdempotency('key-1');
    const claim = await db.claimWebhookIdempotency('key-1', 'fp-1');
    expect(claim).toMatchObject({ claimed: false, reason: 'already_processed' });
  });

  it('rejects a key reused with a different payload fingerprint (key_conflict)', async () => {
    await db.claimWebhookIdempotency('key-1', 'fp-1');
    const claim = await db.claimWebhookIdempotency('key-1', 'fp-2');
    expect(claim).toMatchObject({ claimed: false, reason: 'key_conflict' });
  });

  it('re-claims a failed key so the same payload can be retried', async () => {
    await db.claimWebhookIdempotency('key-1', 'fp-1');
    await db.failWebhookIdempotency('key-1');
    const claim = await db.claimWebhookIdempotency('key-1', 'fp-1');
    expect(claim.claimed).toBe(true);
  });

  it('re-claims an expired key', async () => {
    await db.claimWebhookIdempotency('key-1', 'fp-1', 1);
    await sleep(10);
    const claim = await db.claimWebhookIdempotency('key-1', 'fp-1', 3_600_000);
    expect(claim.claimed).toBe(true);
  });

  it('returns null for unknown keys and completed status after processing', async () => {
    expect(await db.getWebhookIdempotency('nope')).toBeNull();
    await db.claimWebhookIdempotency('key-1', 'fp-1');
    await db.completeWebhookIdempotency('key-1');
    const record = await db.getWebhookIdempotency('key-1');
    expect(record?.status).toBe('completed');
  });
});

describe('DatabaseService — durable webhook outbox (Issue #666 / BA-098)', () => {
  let db: DatabaseService;

  beforeEach(() => {
    db = new DatabaseService(new TransactionManagerService());
  });

  const record = (id: string, maxRetries = 3) => ({
    id,
    url: 'https://example.com/hook',
    body: '{"hello":"world"}',
    signature: 'sig',
    idempotencyKey: `idem-${id}`,
    maxRetries,
  });

  it('stores outbound events before delivery', async () => {
    await db.enqueueWebhookDelivery(record('w-1'));
    const stored = await db.getWebhookOutboxRecord('w-1');
    expect(stored).toMatchObject({ id: 'w-1', status: 'pending', attempts: 0 });
  });

  it('claims due records atomically and does not re-claim sending/delivered records', async () => {
    await db.enqueueWebhookDelivery(record('w-1'));
    await db.enqueueWebhookDelivery(record('w-2'));

    const due = await db.claimDueWebhookDeliveries();
    expect(due.map((r) => r.id).sort()).toEqual(['w-1', 'w-2']);
    expect(due.every((r) => r.status === 'sending')).toBe(true);

    // A second claim pass must not re-claim the same records.
    expect(await db.claimDueWebhookDeliveries()).toEqual([]);

    await db.completeWebhookDelivery('w-1', 200);
    expect(await db.claimDueWebhookDeliveries()).toEqual([]);
  });

  it('records a successful delivery as terminal and inspectable', async () => {
    await db.enqueueWebhookDelivery(record('w-1'));
    await db.claimDueWebhookDeliveries();
    const done = await db.completeWebhookDelivery('w-1', 200);
    expect(done).toMatchObject({ status: 'delivered', attempts: 1, lastStatusCode: 200 });
    expect(done?.deliveredAt).toBeInstanceOf(Date);
    expect(done?.terminalAt).toBeInstanceOf(Date);
  });

  it('reschedules failed deliveries as retrying with a nextRetryAt', async () => {
    await db.enqueueWebhookDelivery(record('w-1', 3));
    await db.claimDueWebhookDeliveries();
    const result = await db.recordWebhookDeliveryFailure('w-1', {
      statusCode: 500,
      error: 'HTTP 500',
      retryDelayMs: 60_000,
    });
    expect(result?.terminal).toBe(false);
    expect(result?.record.status).toBe('retrying');
    expect(result?.record.attempts).toBe(1);
    expect(result?.record.nextRetryAt).toBeInstanceOf(Date);
  });

  it('resumes retrying records once nextRetryAt is due', async () => {
    await db.enqueueWebhookDelivery(record('w-1', 3));
    await db.claimDueWebhookDeliveries();
    await db.recordWebhookDeliveryFailure('w-1', { error: 'boom', retryDelayMs: 0 });

    const due = await db.claimDueWebhookDeliveries();
    expect(due.map((r) => r.id)).toEqual(['w-1']);
    expect(due[0].status).toBe('sending');
  });

  it('marks a record as failed once retries are exhausted and keeps it inspectable', async () => {
    await db.enqueueWebhookDelivery(record('w-1', 2));
    await db.claimDueWebhookDeliveries();
    await db.recordWebhookDeliveryFailure('w-1', { error: 'attempt 1', retryDelayMs: 0 });
    await db.claimDueWebhookDeliveries();
    const terminal = await db.recordWebhookDeliveryFailure('w-1', { error: 'attempt 2', retryDelayMs: 0 });

    expect(terminal?.terminal).toBe(true);
    expect(terminal?.record.status).toBe('failed');
    expect(terminal?.record.terminalAt).toBeInstanceOf(Date);

    const failures = await db.getTerminalWebhookFailures();
    expect(failures.map((r) => r.id)).toEqual(['w-1']);

    const listed = await db.listWebhookOutbox({ status: 'failed' });
    expect(listed.map((r) => r.id)).toEqual(['w-1']);
  });

  it('does not enqueue the same webhook twice', async () => {
    await db.enqueueWebhookDelivery(record('w-1'));
    await db.enqueueWebhookDelivery(record('w-1'));
    const all = await db.listWebhookOutbox();
    expect(all).toHaveLength(1);
  });
});
