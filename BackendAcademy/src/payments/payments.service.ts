import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CorrelationLoggerService } from '../logging/logger.service';
import { DatabaseService, PaymentStatus, WebhookOutboxRecord } from '../database/database.service';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto';
import {
  StellarTransaction,
  TransactionHistoryResponse,
} from './interfaces/transaction.interface';
import { IContractAdapter } from '../contracts';

/**
 * Payments service.
 *
 * #396: On-chain payment recording is isolated behind the
 * {@link IContractAdapter} interface. When the adapter is available,
 * payment events are recorded on-chain for auditability. When it is
 * not available (e.g., test environments), the service operates
 * in off-chain-only mode.
 *
 * #665: Dependencies are declared once in the constructor. `DatabaseService`
 * is required; `IContractAdapter` and `ConfigService` are optional so the
 * service can be instantiated in unit tests with just the required
 * collaborator. Webhook delivery tuning values are read from config with
 * safe defaults (see constructor).
 */
export interface WebhookPayload {
  id: string;
  url: string;
  body: string;
  signature: string;
  idempotencyKey: string;
  maxRetries: number;
}

/**
 * Shape of the JSON body sent by the payment provider for a payment status
 * callback. `eventId` is the provider's identifier for *this specific*
 * event delivery — it is expected to differ across retries in some
 * provider implementations, which is exactly why state validation cannot
 * rely on idempotency-key replay detection alone.
 */
export interface PaymentWebhookEvent {
  eventId: string;
  paymentId: string;
  orderId: string;
  userId: string;
  status: PaymentStatus;
  amount: number;
  assetCode: string;
  provider: string;
  couponCode?: string;
}

export type WebhookProcessingOutcome =
  | { outcome: 'applied'; paymentId: string; status: PaymentStatus }
  | { outcome: 'duplicate'; paymentId: string; reason: string }
  | { outcome: 'noop'; paymentId: string; reason: string }
  | { outcome: 'rejected'; paymentId: string; reason: string };

/**
 * Payments service.
 *
 * #396: On-chain payment recording is isolated behind the
 * {@link IContractAdapter} interface. When the adapter is available,
 * payment events are recorded on-chain for auditability. When it is
 * not available (e.g., test environments), the service operates
 * in off-chain-only mode.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  private readonly stubLedger: StellarTransaction[] = [
    {
      id: 'tx-stub-0001',
      account: 'GACCOUNT-STUB-1',
      hash: 'a1b2c3d4e5f60001',
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      type: 'payment',
      amount: '100.0000000',
      assetCode: 'XLM',
      assetIssuer: null,
      memo: 'course enrollment',
      successful: true,
    },
    {
      id: 'tx-stub-0002',
      account: 'GACCOUNT-STUB-1',
      hash: 'a1b2c3d4e5f60002',
      createdAt: new Date(Date.now() - 172_800_000).toISOString(),
      type: 'payment',
      amount: '25.0000000',
      assetCode: 'USDC',
      assetIssuer: 'GISSUER-STUB-USDC',
      memo: 'badge mint',
      successful: true,
    },
    {
      id: 'tx-stub-0003',
      account: 'GACCOUNT-STUB-1',
      hash: 'a1b2c3d4e5f60003',
      createdAt: new Date(Date.now() - 259_200_000).toISOString(),
      type: 'path_payment',
      amount: '50.0000000',
      assetCode: 'XLM',
      assetIssuer: null,
      memo: 'reward claim',
      successful: true,
    },
    {
      id: 'tx-stub-0004',
      account: 'GACCOUNT-STUB-1',
      hash: 'a1b2c3d4e5f60004',
      createdAt: new Date(Date.now() - 345_600_000).toISOString(),
      type: 'create_account',
      amount: '1.0000000',
      assetCode: 'XLM',
      assetIssuer: null,
      memo: '',
      successful: true,
    },
  ];

  private static readonly MAX_LIMIT = 100;
  private static readonly DEFAULT_LIMIT = 20;

  /** Default outgoing request timeout in ms. */
  private readonly defaultTimeoutMs: number;
  /** Maximum webhook delivery attempts (Issue #412). */
  private readonly webhookMaxRetries: number;
  /** Base backoff for webhook retries (Issue #412). */
  private readonly webhookBaseBackoffMs: number;
  /** Cap for webhook retry backoff (Issue #412). */
  private readonly webhookMaxBackoffMs: number;

  constructor(
    private readonly databaseService: DatabaseService,
    @Optional()
    private readonly contractAdapter?: IContractAdapter,
    @Optional()
    private readonly configService?: ConfigService,
  ) {
    this.defaultTimeoutMs =
      this.configService?.get<number>('DEFAULT_REQUEST_TIMEOUT_MS') ?? 30_000;
    this.webhookMaxRetries =
      this.configService?.get<number>('WEBHOOK_MAX_RETRIES') ?? 5;
    this.webhookBaseBackoffMs =
      this.configService?.get<number>('WEBHOOK_BASE_BACKOFF_MS') ?? 1_000;
    this.webhookMaxBackoffMs =
      this.configService?.get<number>('WEBHOOK_MAX_BACKOFF_MS') ?? 60_000;
  }

  /**
   * Executes a fetch with a global timeout policy.
   */
  async fetchWithTimeout(
    url: string,
    init?: RequestInit,
    timeoutMs?: number,
  ): Promise<Response> {
    const timeout = timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------------------------------------------------------------------------
  // Durable webhook delivery outbox — Issue #666 (BA-098)
  // ---------------------------------------------------------------------------

  /**
   * Persists an outbound webhook *before* delivery is attempted so the event
   * and its retry state survive a process failure. Subsequent delivery is
   * driven by {@link deliverDueWebhooks}, which resumes from the outbox.
   */
  async enqueueWebhook(webhook: WebhookPayload): Promise<WebhookOutboxRecord> {
    return this.databaseService.enqueueWebhookDelivery({
      id: webhook.id,
      url: webhook.url,
      body: webhook.body,
      signature: webhook.signature,
      idempotencyKey: webhook.idempotencyKey,
      maxRetries: webhook.maxRetries,
    });
  }

  /**
   * Claims every outbox record that is due (pending, or retrying with
   * `nextRetryAt` in the past) and delivers each one once, recording the
   * outcome back into the durable outbox. Failures are rescheduled with
   * exponential backoff + jitter; exhausted retries become inspectable
   * terminal failures.
   */
  async deliverDueWebhooks(
    deliverFn: (url: string, body: string, headers: Record<string, string>) => Promise<number>,
    options?: { limit?: number; webhookId?: string },
  ): Promise<WebhookOutboxRecord[]> {
    const due = await this.databaseService.claimDueWebhookDeliveries(options?.limit ?? 10);
    const targeted = options?.webhookId ? due.filter((r) => r.id === options.webhookId) : due;
    const processed: WebhookOutboxRecord[] = [];
    for (const record of targeted) {
      processed.push(await this.deliverWebhookAttempt(record, deliverFn));
    }
    return processed;
  }

  /**
   * Delivers a single webhook and records the outcome durably.
   */
  private async deliverWebhookAttempt(
    record: WebhookOutboxRecord,
    deliverFn: (url: string, body: string, headers: Record<string, string>) => Promise<number>,
  ): Promise<WebhookOutboxRecord> {
    const attemptNumber = record.attempts + 1;
    const headers: Record<string, string> = {
      'X-Webhook-Signature': record.signature,
      'X-Idempotency-Key': record.idempotencyKey,
      'X-Webhook-Attempt': String(attemptNumber),
    };
    const correlationId = CorrelationLoggerService.getCorrelationId();
    if (correlationId) {
      headers['x-correlation-id'] = correlationId;
    }

    let statusCode: number | undefined;
    let error: string | undefined;
    try {
      statusCode = await deliverFn(record.url, record.body, headers);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    if (statusCode !== undefined && statusCode >= 200 && statusCode < 300) {
      this.logger.log(`Webhook ${record.id} delivered on attempt ${attemptNumber}`);
      return (
        (await this.databaseService.completeWebhookDelivery(record.id, statusCode)) ?? record
      );
    }

    if (statusCode !== undefined && error === undefined) {
      error = `HTTP ${statusCode}`;
    }
    return (
      (await this.recordOutboxFailure(record.id, attemptNumber, statusCode, error)) ?? record
    );
  }

  private async recordOutboxFailure(
    id: string,
    attemptNumber: number,
    statusCode?: number,
    error?: string,
  ): Promise<WebhookOutboxRecord | null> {
    const retryDelayMs = this.calculateRetryDelay(attemptNumber);
    const result = await this.databaseService.recordWebhookDeliveryFailure(id, {
      statusCode,
      error,
      retryDelayMs,
    });
    if (!result) return null;
    if (result.terminal) {
      this.logger.error(
        `Webhook ${id} failed after ${result.record.attempts} attempts: ${result.record.lastError}`,
      );
    } else {
      this.logger.warn(
        `Webhook ${id} attempt ${result.record.attempts} failed (${result.record.lastError}), ` +
          `retrying at ${result.record.nextRetryAt?.toISOString()}`,
      );
    }
    return result.record;
  }

  /**
   * Delivers a webhook with exponential backoff, jitter, and retry — Issue
   * #412. Issue #666 (BA-098): delivery now goes through the durable outbox
   * (enqueue before delivery, resumable retries, inspectable failures)
   * instead of fire-and-forget in-process retries.
   */
  async deliverWebhookWithRetry(
    webhook: WebhookPayload,
    deliverFn: (
      url: string,
      body: string,
      headers: Record<string, string>,
    ) => Promise<number>,
  ): Promise<{ success: boolean; attempts: number; lastError?: string }> {
    await this.enqueueWebhook(webhook);
    let record = await this.databaseService.getWebhookOutboxRecord(webhook.id);
    let lastError: string | undefined;
    for (let attempt = 1; attempt <= webhook.maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = {
          'X-Webhook-Signature': webhook.signature,
          'X-Idempotency-Key': webhook.idempotencyKey,
          'X-Webhook-Attempt': String(attempt),
        };
        const correlationId = CorrelationLoggerService.getCorrelationId();
        if (correlationId) {
          headers['x-correlation-id'] = correlationId;
        }
        const statusCode = await deliverFn(webhook.url, webhook.body, headers);
        if (statusCode >= 200 && statusCode < 300) {
          this.logger.log(
            `Webhook ${webhook.id} delivered on attempt ${attempt}`,
          );
          // Mark the durable outbox as delivered so its terminal state stays
          // inspectable (the enqueue-before-deliver contract from #666).
          await this.databaseService.completeWebhookDelivery(webhook.id, statusCode);
          return { success: true, attempts: attempt };
        }
        lastError = `HTTP ${statusCode}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    // Drive the delivery to a terminal state through the durable outbox,
    // honouring the exponential-backoff schedule stored on the record.
    let guard = 0;
    while (
      record &&
      record.status !== 'delivered' &&
      record.status !== 'failed' &&
      guard < 100
    ) {
      const [attempted] = await this.deliverDueWebhooks(deliverFn, {
        webhookId: webhook.id,
      });
      record = attempted ?? record;
      if (record.status === 'retrying' && record.nextRetryAt) {
        const delayMs = Math.max(0, record.nextRetryAt.getTime() - Date.now());
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      guard++;
    }

    if (!record) {
      return { success: false, attempts: 0, lastError: 'Webhook not found in outbox' };
    }
    if (record.status === 'delivered') {
      return { success: true, attempts: record.attempts };
    }
    return { success: false, attempts: record.attempts, lastError: record.lastError };
  }

  /**
   * Returns the durable delivery record for a single webhook.
   */
  async getWebhookDeliveryRecord(id: string): Promise<WebhookOutboxRecord | null> {
    return this.databaseService.getWebhookOutboxRecord(id);
  }

  /**
   * Lists durable webhook delivery records, optionally filtered by status.
   */
  async listWebhookOutbox(filter?: { status?: WebhookOutboxRecord['status']; limit?: number }) {
    return this.databaseService.listWebhookOutbox(filter);
  }

  /**
   * Returns terminal (retry-exhausted) webhook delivery failures for inspection.
   */
  async getTerminalWebhookFailures(limit = 50): Promise<WebhookOutboxRecord[]> {
    return this.databaseService.getTerminalWebhookFailures(limit);
  }

  /**
   * Calculates retry delay with exponential backoff and jitter — Issue #412.
   */
  calculateRetryDelay(attemptNumber: number): number {
    const exponential = Math.min(
      this.webhookBaseBackoffMs * Math.pow(2, attemptNumber - 1),
      this.webhookMaxBackoffMs,
    );
    const jitter = exponential * (0.5 + Math.random() * 0.5);
    return Math.floor(jitter);
  }

  getTransactionHistory(
    query: TransactionHistoryQueryDto,
  ): TransactionHistoryResponse {
    const { account, limit, cursor } = query;

    let filtered = [...this.stubLedger];
    if (account) {
      filtered = filtered.filter((tx) => tx.account === account);
    }

    const effectiveLimit = Math.min(
      Math.max(1, Number(limit) || PaymentsService.DEFAULT_LIMIT),
      PaymentsService.MAX_LIMIT,
    );

    const startIdx = cursor ? parseInt(cursor, 10) || 0 : 0;
    const page = filtered.slice(startIdx, startIdx + effectiveLimit);
    const remaining = filtered.length - (startIdx + page.length);

    const response: TransactionHistoryResponse = {
      entries: page,
      total: filtered.length,
    };
    if (remaining > 0) {
      response.nextCursor = String(startIdx + page.length);
    }
    return response;
  }

  async validateCoupon(code: string, userId: string, amount: number) {
    return this.databaseService.validateCoupon(code, userId, amount);
  }

  async applyCoupon(code: string, userId: string, amount: number, orderId: string) {
    const result = await this.databaseService.applyCoupon(
      code,
      userId,
      amount,
      orderId,
    );

    // ── #396: Record payment on-chain via contract adapter ──────────
    if (this.contractAdapter) {
      try {
        await this.contractAdapter.recordPayment(
          userId,
          'platform',
          amount,
          'XLM',
          `Coupon redemption: ${code} for order ${orderId}`,
        );
      } catch (err) {
        this.logger.warn(
          `[PaymentsService] Contract adapter payment recording failed (non-blocking): ${err}`,
        );
      }
    }

    return result;
  }

  async getRedemptionHistory(userId: string) {
    return this.databaseService.getRedemptionsByUser(userId);
  }

  async getAllCoupons() {
    return this.databaseService.getAllCoupons();
  }

  /**
   * Validates that a provider callback matches the stored payment for
   * `orderId`, `userId`, `amount`, `assetCode`, and `provider` (BA-096).
   *
   * A payment is only allowed to change status when every business field in
   * the callback agrees with what we already recorded for that payment. Any
   * mismatch is rejected *and* audited via the log, and no side effect runs
   * for the offending event. Exceptions: when the payment is brand new
   * (first callback) it is seeded from the event itself, which is the only
   * legitimate divergence path.
   */
  verifyEventMatchesPayment(
    event: PaymentWebhookEvent,
    stored: {
      orderId: string;
      userId: string;
      amount: number;
      assetCode: string;
      provider: string;
    },
  ): { valid: true } | { valid: false; mismatches: string[] } {
    const mismatches: string[] = [];
    if (event.orderId !== stored.orderId) {
      mismatches.push(
        `orderId (event=${event.orderId}, stored=${stored.orderId})`,
      );
    }
    if (event.userId !== stored.userId) {
      mismatches.push(
        `userId (event=${event.userId}, stored=${stored.userId})`,
      );
    }
    if (event.assetCode !== stored.assetCode) {
      mismatches.push(
        `assetCode (event=${event.assetCode}, stored=${stored.assetCode})`,
      );
    }
    if (event.provider !== stored.provider) {
      mismatches.push(
        `provider (event=${event.provider}, stored=${stored.provider})`,
      );
    }
    if (Math.abs(event.amount - stored.amount) > 1e-9) {
      mismatches.push(
        `amount (event=${event.amount}, stored=${stored.amount})`,
      );
    }
    return mismatches.length === 0
      ? { valid: true }
      : { valid: false, mismatches };
  }

  /**
   * BA-092: Atomically reserve wallet funds before a payment is confirmed.
   *
   * The reservation is keyed by `reservationId` (use the payment id) so
   * pending webhook deliveries and retries cannot reserve the same balance
   * more than once. The database layer excludes active reservations from
   * available-balance calculations.
   */
  async reserveFunds(input: {
    reservationId: string;
    userId: string;
    amount: number;
    assetCode: string;
  }): Promise<{ success: boolean; reason?: string }> {
    return this.databaseService.reserveFunds(input);
  }

  /**
   * BA-092: Release a previously reserved amount when a payment reaches a
   * terminal failure state. Releasing an unknown reservation is a no-op.
   */
  async releaseFunds(reservationId: string): Promise<void> {
    await this.databaseService.releaseFunds(reservationId);
  }

  /**
   * Processes a validated, signature-checked payment webhook event.
   *
   * Two independent safeguards protect payment state here:
   *
   * 1. BA-096 (identity + amount consistency): before any status transition
   *    is attempted, {@link verifyEventMatchesPayment} checks that the
   *    callback's `orderId`, `userId`, `amount`, `assetCode`, and `provider`
   *    match the stored payment. Mismatches are rejected and audited.
   *
   * 2. Issue #412 follow-up: it never applies the caller's claimed status
   *    directly — it always defers to DatabaseService.updatePaymentStatus,
   *    which re-checks the payment's *current* stored status against the
   *    legal-transition graph. Duplicate callbacks (same event id, or a
   *    callback that would just repeat the current status) are recognized
   *    and short-circuited before any side effect (like granting a coupon
   *    redemption) runs, and illegal transitions are rejected outright.
   */
  async processPaymentWebhookEvent(
    event: PaymentWebhookEvent,
  ): Promise<WebhookProcessingOutcome> {
    // Ensure the payment row exists. The first callback for a payment seeds
    // it in `pending` using the event's own identity fields (this is the
    // sole legitimate case where event fields define the stored payment).
    const existing = await this.databaseService.getPaymentById(event.paymentId);
    if (!existing) {
      await this.databaseService.createPayment({
        id: event.paymentId,
        orderId: event.orderId,
        userId: event.userId,
        status: 'pending',
        amount: event.amount,
        assetCode: event.assetCode,
        provider: event.provider,
      });
    } else {
      // The payment already exists — the callback's identity fields MUST
      // agree with what we stored, otherwise the callback is rejected and
      // audited before any state mutation (BA-096).
      const match = this.verifyEventMatchesPayment(event, {
        orderId: existing.orderId,
        userId: existing.userId,
        amount: existing.amount,
        assetCode: existing.assetCode,
        provider: existing.provider,
      });

      if (!match.valid) {
        const reason = `Payment ${event.paymentId}: mismatched callback fields: ${match.mismatches.join(', ')}`;
        this.logger.warn(
          `Rejected webhook event ${event.eventId} (identity/amount mismatch): ${reason}`,
        );
        return {
          outcome: 'rejected',
          paymentId: event.paymentId,
          reason,
        };
      }
    }

    const result = await this.databaseService.updatePaymentStatus(
      event.paymentId,
      event.status,
      event.eventId,
    );

    if (!result.success) {
      this.logger.warn(
        `Rejected webhook event ${event.eventId} for payment ${event.paymentId}: ${result.reason}`,
      );
      return {
        outcome: 'rejected',
        paymentId: event.paymentId,
        reason: result.reason ?? 'invalid transition',
      };
    }

    if (result.duplicateEvent) {
      this.logger.log(
        `Ignoring duplicate webhook event ${event.eventId} for payment ${event.paymentId}`,
      );
      return {
        outcome: 'duplicate',
        paymentId: event.paymentId,
        reason: result.reason ?? 'duplicate event',
      };
    }

    if (event.status === 'pending') {
      const reserved = await this.reserveFunds({
        reservationId: event.paymentId,
        userId: event.userId,
        amount: event.amount,
        assetCode: event.assetCode,
      });
      if (!reserved.success) {
        return {
          outcome: 'rejected',
          paymentId: event.paymentId,
          reason: reserved.reason ?? 'fund reservation failed',
        };
      }
    }

    if (!result.transitioned) {
      // Legal but a no-op (payment already in the requested status under a
      // different event id) — do not re-run side effects.
      return {
        outcome: 'noop',
        paymentId: event.paymentId,
        reason: result.reason ?? 'no state change',
      };
    }

    if (event.status === 'failed') {
      await this.releaseFunds(event.paymentId);
    }

    // Only a genuine, first-time transition into `succeeded` grants a
    // coupon redemption, so a duplicated success callback can never apply
    // the discount twice.
    if (event.status === 'succeeded' && event.couponCode) {
      const applied = await this.applyCoupon(
        event.couponCode,
        event.userId,
        event.amount,
        event.orderId,
      );
      if (!applied.success) {
        this.logger.warn(
          `Payment ${event.paymentId} succeeded but coupon ${event.couponCode} could not be applied: ${applied.reason}`,
        );
      }
    }

    this.logger.log(
      `Applied webhook event ${event.eventId}: payment ${event.paymentId} -> ${event.status}`,
    );
    return { outcome: 'applied', paymentId: event.paymentId, status: event.status };
  }
}