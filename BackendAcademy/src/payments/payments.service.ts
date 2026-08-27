import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CorrelationLoggerService } from '../logging/logger.service';
import { DatabaseService, PaymentStatus } from '../database/database.service';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto';
import {
  StellarTransaction,
  TransactionHistoryResponse,
} from './interfaces/transaction.interface';
import { IContractAdapter } from '../contracts';

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
 * rely on idempotency-key replay detection alone (see
 * DatabaseService.updatePaymentStatus) — Issue #412 follow-up.
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

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  private readonly defaultTimeoutMs: number;
  private readonly webhookMaxRetries: number;
  private readonly webhookBaseBackoffMs: number;
  private readonly webhookMaxBackoffMs: number;

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

  constructor(
    private readonly databaseService: DatabaseService,
    @Optional()
    private readonly contractAdapter?: IContractAdapter,
    @Optional()
    private readonly configService?: ConfigService,
  ) {
    this.defaultTimeoutMs = this.configService?.get<number>('DEFAULT_REQUEST_TIMEOUT_MS') ?? 30_000;
    this.webhookMaxRetries = this.configService?.get<number>('WEBHOOK_MAX_RETRIES') ?? 5;
    this.webhookBaseBackoffMs = this.configService?.get<number>('WEBHOOK_BASE_BACKOFF_MS') ?? 1_000;
    this.webhookMaxBackoffMs = this.configService?.get<number>('WEBHOOK_MAX_BACKOFF_MS') ?? 60_000;
  }

  /**
   * Executes a fetch with a global timeout policy.
   */
  async fetchWithTimeout(url: string, init?: RequestInit, timeoutMs?: number): Promise<Response> {
    const timeout = timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Delivers a webhook with exponential backoff, jitter, and retry — Issue #412.
   */
  async deliverWebhookWithRetry(
    webhook: WebhookPayload,
    deliverFn: (url: string, body: string, headers: Record<string, string>) => Promise<number>,
  ): Promise<{ success: boolean; attempts: number; lastError?: string }> {
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
          this.logger.log(`Webhook ${webhook.id} delivered on attempt ${attempt}`);
          return { success: true, attempts: attempt };
        }
        lastError = `HTTP ${statusCode}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }

      if (attempt < webhook.maxRetries) {
        const delay = this.calculateRetryDelay(attempt);
        this.logger.warn(
          `Webhook ${webhook.id} attempt ${attempt} failed (${lastError}), retrying in ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    this.logger.error(
      `Webhook ${webhook.id} failed after ${webhook.maxRetries} attempts: ${lastError}`,
    );
    return { success: false, attempts: webhook.maxRetries, lastError };
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

  getTransactionHistory(query: TransactionHistoryQueryDto): TransactionHistoryResponse {
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
    const result = await this.databaseService.applyCoupon(code, userId, amount, orderId);

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
   * Processes a validated, signature-checked payment webhook event.
   *
   * Issue #412 follow-up: this is the single choke point where a provider
   * callback is allowed to mutate payment state. It never applies the
   * caller's claimed status directly — it always defers to
   * DatabaseService.updatePaymentStatus, which re-checks the payment's
   * *current* stored status against the legal-transition graph. Duplicate
   * callbacks (same event id, or a callback that would just repeat the
   * current status) are recognized and short-circuited before any side
   * effect (like granting a coupon redemption) runs, and illegal
   * transitions (e.g. `succeeded` -> `pending`, or mutating a payment that
   * already resolved to `failed`/`refunded`) are rejected outright.
   */
  async processPaymentWebhookEvent(event: PaymentWebhookEvent): Promise<WebhookProcessingOutcome> {
    // Ensure the payment row exists (first callback for a payment creates it
    // in `pending`; this is a no-op for payments we already know about).
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

    if (!result.transitioned) {
      // Legal but a no-op (payment already in the requested status under a
      // different event id) — do not re-run side effects.
      return {
        outcome: 'noop',
        paymentId: event.paymentId,
        reason: result.reason ?? 'no state change',
      };
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
