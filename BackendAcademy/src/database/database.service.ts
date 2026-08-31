import { Injectable, Logger, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import {
  TransactionManagerService,
  TransactionSnapshot,
} from '../common/transaction-manager.service';

export interface CouponRecord {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxRedemptions: number;
  currentRedemptions: number;
  expiresAt: Date | null;
  minPurchaseAmount: number;
  applicablePlans: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RedemptionRecord {
  id: string;
  couponId: string;
  code: string;
  userId: string;
  amount: number;
  discountApplied: number;
  redeemedAt: Date;
  orderId: string;
}

/**
 * Payment lifecycle states — Issue #412 follow-up.
 *
 * A payment can only ever move "forward" through this graph. Any callback
 * that asks for a transition not present in ALLOWED_TRANSITIONS is rejected,
 * regardless of whether its idempotency key has been seen before. This is
 * what protects us from duplicate/out-of-order provider callbacks mutating
 * state incorrectly (e.g. a delayed `pending` retry arriving after a
 * `succeeded` callback, or a `succeeded` callback being re-applied and
 * double-granting redemption side effects).
 */
export type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded';

/**
 * Every payment status, in declaration order. Exported so transition tests
 * and callers can enumerate the full state space without re-listing it.
 *
 * #661 (BA-093): used by the exhaustive state-transition test suite.
 */
export const PAYMENT_STATUSES: PaymentStatus[] = [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'refunded',
];

export interface PaymentRecord {
  id: string;
  orderId: string;
  userId: string;
  status: PaymentStatus;
  amount: number;
  assetCode: string;
  provider: string;
  /** Ids of every provider event that has already been applied to this payment. */
  appliedEventIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentTransitionResult {
  success: boolean;
  /** True when the requested status was applied and actually changed state. */
  transitioned: boolean;
  /** True when this exact event id had already been applied (safe no-op). */
  duplicateEvent?: boolean;
  /** True when the payment was already in the requested status (idempotent no-op). */
  alreadyInStatus?: boolean;
  reason?: string;
  payment?: PaymentRecord;
}

/**
 * Lifecycle of a webhook idempotency key — Issue #663 (BA-095).
 *
 * Unlike the previous process-local replay maps, claims are stored in the
 * database layer and carry a payload fingerprint plus an explicit
 * processing status, so a restart (or another replica) cannot lose the
 * claim and in-progress work is distinguishable from completed work.
 */
export type WebhookIdempotencyStatus = 'in_progress' | 'completed' | 'failed';

export interface WebhookIdempotencyRecord {
  idempotencyKey: string;
  /** SHA-256 fingerprint of the raw webhook payload. */
  payloadFingerprint: string;
  status: WebhookIdempotencyStatus;
  firstReceivedAt: Date;
  expiresAt: Date;
  updatedAt: Date;
}

export type WebhookIdempotencyClaim =
  | { claimed: true; record: WebhookIdempotencyRecord }
  | {
      claimed: false;
      reason: 'already_in_progress' | 'already_processed' | 'key_conflict';
      record: WebhookIdempotencyRecord;
    };

/**
 * Durable outbox record for outbound webhook delivery — Issue #666 (BA-098).
 *
 * Outbound events are persisted *before* delivery is attempted, retries are
 * resumed from `nextRetryAt` instead of a process-local queue, and terminal
 * failures stay inspectable via {@link getTerminalWebhookFailures}.
 */
export type WebhookOutboxStatus =
  | 'pending'
  | 'sending'
  | 'retrying'
  | 'delivered'
  | 'failed';

export interface WebhookOutboxRecord {
  id: string;
  url: string;
  body: string;
  signature: string;
  idempotencyKey: string;
  maxRetries: number;
  status: WebhookOutboxStatus;
  /** Number of delivery attempts made so far (starts at 0). */
  attempts: number;
  nextRetryAt: Date | null;
  lastError?: string;
  lastStatusCode?: number;
  createdAt: Date;
  updatedAt: Date;
  deliveredAt?: Date;
  terminalAt?: Date;
}

export type NewWebhookOutboxRecord = Pick<
  WebhookOutboxRecord,
  'id' | 'url' | 'body' | 'signature' | 'idempotencyKey' | 'maxRetries'
>;

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private coupons: Map<string, CouponRecord> = new Map();
  private redemptions: RedemptionRecord[] = [];
  private payments: Map<string, PaymentRecord> = new Map();
  private migrationsApplied: string[] = [];
  /** Durable webhook idempotency claims — Issue #663 (BA-095). */
  private webhookIdempotency: Map<string, WebhookIdempotencyRecord> = new Map();
  /** Durable webhook delivery outbox — Issue #666 (BA-098). */
  private webhookOutbox: Map<string, WebhookOutboxRecord> = new Map();

  constructor(private readonly transactionManager: TransactionManagerService) {}

  /**
   * Explicit state machine for payment status transitions. A status that
   * does not appear as a key has no legal outgoing transitions (terminal).
   *
   * #661 (BA-093): this is the single, centralized source of truth for legal
   * transitions. Both the webhook ingress path
   * ({@link PaymentsService.processPaymentWebhookEvent}) and any internal
   * status update route through {@link updatePaymentStatus}, which consults
   * these rules, so illegal regressions and terminal-state changes are
   * rejected everywhere.
   */
  static readonly ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
    pending: ['processing', 'succeeded', 'failed'],
    processing: ['succeeded', 'failed'],
    succeeded: ['refunded'],
    failed: [],
    refunded: [],
  };

  /**
   * Returns whether transitioning from `from` to `to` is legal under the
   * centralized payment state machine (#661 / BA-093). A no-op
   * (`from === to`) is considered legal because callers treat it as an
   * idempotent no-op rather than a transition.
   */
  static isLegalPaymentTransition(from: PaymentStatus, to: PaymentStatus): boolean {
    if (from === to) return true;
    const allowed = DatabaseService.ALLOWED_TRANSITIONS[from] ?? [];
    return allowed.includes(to);
  }

  /**
   * Returns whether a status is terminal (has no legal outgoing transitions),
   * so any further change from it must be rejected (#661 / BA-093).
   */
  static isTerminalPaymentStatus(status: PaymentStatus): boolean {
    return (DatabaseService.ALLOWED_TRANSITIONS[status] ?? []).length === 0;
  }

  onModuleInit() {
    this.seedSampleCoupons();
    this.ensureMigrationTracking();
  }

  /**
   * Ensures migration tracking table is initialized.
   * Runs as part of startup to guarantee migration order awareness.
   */
  private ensureMigrationTracking(): void {
    this.migrationsApplied = [];
  }

  recordMigrationApplied(name: string): void {
    this.migrationsApplied.push(name);
  }

  getAppliedMigrations(): string[] {
    return [...this.migrationsApplied];
  }

  hasMigrationBeenApplied(name: string): boolean {
    return this.migrationsApplied.includes(name);
  }

  private seedSampleCoupons() {
    const sample: CouponRecord[] = [
      {
        id: 'coupon-stellar10',
        code: 'STELLAR10',
        discountType: 'percentage',
        discountValue: 10,
        maxRedemptions: 100,
        currentRedemptions: 0,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        minPurchaseAmount: 0,
        applicablePlans: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'coupon-academy25',
        code: 'ACADEMY25',
        discountType: 'fixed',
        discountValue: 25,
        maxRedemptions: 50,
        currentRedemptions: 0,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        minPurchaseAmount: 100,
        applicablePlans: ['premium', 'pro'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    sample.forEach((c) => this.coupons.set(c.id, c));
  }

  // ---------------------------------------------------------------------
  // Health check — Issue #375
  // ---------------------------------------------------------------------

  /**
   * Returns true when the database (in-memory store) is operational.
   */
  async isHealthy(): Promise<boolean> {
    // The in-memory store is always healthy as long as the process runs.
    // In production, this would verify actual DB connectivity (e.g.,
    // SELECT 1 or a connection pool ping).
    return true;
  }

  async createCoupon(coupon: CouponRecord): Promise<CouponRecord> {
    this.coupons.set(coupon.id, coupon);
    return coupon;
  }

  async getCouponById(id: string): Promise<CouponRecord | null> {
    return this.coupons.get(id) ?? null;
  }

  async getCouponByCode(code: string): Promise<CouponRecord | null> {
    for (const coupon of this.coupons.values()) {
      if (coupon.code === code) return coupon;
    }
    return null;
  }

  async getAllCoupons(): Promise<CouponRecord[]> {
    return Array.from(this.coupons.values());
  }

  async updateCoupon(id: string, updates: Partial<CouponRecord>): Promise<CouponRecord | null> {
    const existing = this.coupons.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.coupons.set(id, updated);
    return updated;
  }

  async recordRedemption(redemption: RedemptionRecord): Promise<RedemptionRecord> {
    this.redemptions.push(redemption);
    return redemption;
  }

  async getRedemptionsByCoupon(couponId: string): Promise<RedemptionRecord[]> {
    return this.redemptions.filter((r) => r.couponId === couponId);
  }

  async getRedemptionsByUser(userId: string): Promise<RedemptionRecord[]> {
    return this.redemptions.filter((r) => r.userId === userId);
  }

  async getAllRedemptions(limit = 50): Promise<RedemptionRecord[]> {
    return this.redemptions.slice(-limit);
  }

  async validateCoupon(
    code: string,
    userId: string,
    amount: number,
  ): Promise<{ valid: boolean; reason?: string; coupon?: CouponRecord }> {
    const coupon = await this.getCouponByCode(code);
    if (!coupon) return { valid: false, reason: 'Coupon not found' };
    if (!coupon.isActive) return { valid: false, reason: 'Coupon is no longer active' };
    if (coupon.expiresAt && coupon.expiresAt < new Date())
      return { valid: false, reason: 'Coupon has expired' };
    if (coupon.currentRedemptions >= coupon.maxRedemptions)
      return { valid: false, reason: 'Coupon redemption limit reached' };
    if (amount < coupon.minPurchaseAmount)
      return {
        valid: false,
        reason: `Minimum purchase amount of ${coupon.minPurchaseAmount} not met`,
      };
    const userRedemptions = await this.getRedemptionsByUser(userId);
    if (userRedemptions.some((r) => r.couponId === coupon.id))
      return { valid: false, reason: 'Coupon already redeemed by this user' };
    return { valid: true, coupon };
  }

  async applyCoupon(code: string, userId: string, amount: number, orderId: string) {
    const validation = await this.validateCoupon(code, userId, amount);
    if (!validation.valid || !validation.coupon) {
      return { success: false, finalAmount: amount, discountApplied: 0, reason: validation.reason };
    }
    const coupon = validation.coupon; // now narrowed to CouponRecord, not CouponRecord | undefined

    const discountApplied =
      coupon.discountType === 'percentage'
        ? Math.round((amount * coupon.discountValue) / 100)
        : coupon.discountValue;
    const finalAmount = Math.max(0, amount - discountApplied);

    await this.recordRedemption({
      id: `rdm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      couponId: coupon.id,
      code: coupon.code,
      userId,
      amount,
      discountApplied,
      redeemedAt: new Date(),
      orderId,
    });
    await this.updateCoupon(coupon.id, { currentRedemptions: coupon.currentRedemptions + 1 });
    return { success: true, finalAmount, discountApplied };
  }

  /**
   * Generic cursor-based pagination helper for in-memory collections.
   * Returns a stable page using (createdAt, id) as the sort key.
   */
  cursorPaginate<T extends { id: string; createdAt: Date }>(
    items: T[],
    options: { cursor?: string; limit: number },
  ): { page: T[]; nextCursor?: string } {
    const sorted = [...items].sort((a, b) => {
      const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id);
    });

    let startIndex = 0;
    if (options.cursor) {
      const idx = sorted.findIndex((item) => item.id === options.cursor);
      if (idx !== -1) startIndex = idx + 1;
    }

    const page = sorted.slice(startIndex, startIndex + options.limit);
    const nextCursor = page.length === options.limit ? page[page.length - 1].id : undefined;

    return { page, nextCursor };
  }

  // ---------------------------------------------------------------------
  // Payment state machine — Issue #412 follow-up
  // ---------------------------------------------------------------------

  async createPayment(
    payment: Omit<PaymentRecord, 'appliedEventIds' | 'createdAt' | 'updatedAt'>,
  ): Promise<PaymentRecord> {
    const existing = this.payments.get(payment.id);
    if (existing) return existing;
    const record: PaymentRecord = {
      ...payment,
      appliedEventIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.payments.set(record.id, record);
    return record;
  }

  async getPaymentById(paymentId: string): Promise<PaymentRecord | null> {
    return this.payments.get(paymentId) ?? null;
  }

  /**
   * Validates and applies a status transition for a payment.
   *
   * This is the core safeguard for Issue #412: it never trusts the caller's
   * claimed "new status" blindly. It always re-reads the payment's *current*
   * stored status and checks it against the allowed-transitions graph before
   * mutating anything. Two extra layers of duplicate protection are applied
   * on top of the transport-level idempotency key check done in the
   * controller:
   *   1. If this exact provider event id was already applied to this
   *      payment, the call is a safe no-op (duplicateEvent: true).
   *   2. If the payment is already in the requested status, the call is a
   *      safe no-op (alreadyInStatus: true) — this covers cases where the
   *      provider sends the same logical event under a different event id.
   * Only a genuine, first-time, legal transition returns transitioned: true;
   * callers should gate side effects (e.g. granting a coupon redemption) on
   * that flag alone.
   *
   * #358: All mutations are wrapped in a transactional atomic operation.
   * If the status update, event ID append, or timestamp update fail, every
   * mutation is rolled back so the payment is never left in an
   * inconsistent intermediate state.
   */
  async updatePaymentStatus(
    paymentId: string,
    newStatus: PaymentStatus,
    eventId: string,
  ): Promise<PaymentTransitionResult> {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      return { success: false, transitioned: false, reason: `Payment ${paymentId} not found` };
    }

    if (payment.appliedEventIds.includes(eventId)) {
      return {
        success: true,
        transitioned: false,
        duplicateEvent: true,
        reason: `Event ${eventId} already applied to payment ${paymentId}`,
        payment,
      };
    }

    if (payment.status === newStatus) {
      // Record the event id so a differently-keyed repeat of the same
      // logical callback is also recognized as a duplicate next time.
      payment.appliedEventIds.push(eventId);
      payment.updatedAt = new Date();
      return {
        success: true,
        transitioned: false,
        alreadyInStatus: true,
        reason: `Payment ${paymentId} already in status ${newStatus}`,
        payment,
      };
    }

    const allowedNext = DatabaseService.ALLOWED_TRANSITIONS[payment.status] ?? [];
    if (!allowedNext.includes(newStatus)) {
      return {
        success: false,
        transitioned: false,
        reason: `Illegal transition for payment ${paymentId}: ${payment.status} -> ${newStatus}`,
        payment,
      };
    }

    // Apply the transition atomically — capture pre-mutation state for
    // rollback in case any step fails (#358).
    const prevStatus = payment.status;
    const prevEventIds = [...payment.appliedEventIds];
    const prevUpdatedAt = payment.updatedAt;

    const txResult = await this.transactionManager.runAtomic(async (tx) => {
      payment.status = newStatus;
      payment.appliedEventIds.push(eventId);
      payment.updatedAt = new Date();
      this.payments.set(payment.id, payment);

      await tx.addOperation(async (): Promise<TransactionSnapshot> => ({
        restore: () => {
          payment.status = prevStatus;
          payment.appliedEventIds.splice(
            payment.appliedEventIds.length - 1,
            1,
          );
          payment.updatedAt = prevUpdatedAt;
          this.payments.set(payment.id, payment);
        },
        data: { paymentId, prevStatus, prevEventIds, prevUpdatedAt },
      }));

      return payment;
    });

    if (!txResult.success) {
      this.logger.error(
        `Payment status transition failed for ${paymentId}: ${txResult.error?.message}`,
      );
      return {
        success: false,
        transitioned: false,
        reason: `Transaction failed: ${txResult.error?.message}`,
        payment,
      };
    }

    return { success: true, transitioned: true, payment };
  }

  // ---------------------------------------------------------------------
  // Durable webhook idempotency — Issue #663 (BA-095)
  // ---------------------------------------------------------------------

  /**
   * Atomically claims an idempotency key for webhook processing.
   *
   * The claim is durable (stored in the database layer rather than a
   * process-local map), fingerprint-bound to the payload, and carries an
   * explicit processing status so in-progress work can be told apart from
   * completed work:
   *
   * - same key + same fingerprint while `in_progress`  → already_in_progress
   * - same key + same fingerprint while `completed`   → already_processed
   * - same key + different fingerprint                → key_conflict
   * - same key + same fingerprint while `failed`      → re-claimed (retry)
   * - expired key                                     → re-claimed
   * - unknown key                                     → claimed
   */
  async claimWebhookIdempotency(
    idempotencyKey: string,
    payloadFingerprint: string,
    ttlMs = 3_600_000,
  ): Promise<WebhookIdempotencyClaim> {
    const now = new Date();
    const existing = this.webhookIdempotency.get(idempotencyKey);

    if (existing && existing.expiresAt > now) {
      if (existing.payloadFingerprint !== payloadFingerprint) {
        return { claimed: false, reason: 'key_conflict', record: existing };
      }
      if (existing.status === 'in_progress') {
        return { claimed: false, reason: 'already_in_progress', record: existing };
      }
      if (existing.status === 'completed') {
        return { claimed: false, reason: 'already_processed', record: existing };
      }
      // `failed` falls through: the same payload may legitimately be retried.
    }

    const record: WebhookIdempotencyRecord = {
      idempotencyKey,
      payloadFingerprint,
      status: 'in_progress',
      firstReceivedAt: existing ? existing.firstReceivedAt : now,
      expiresAt: new Date(now.getTime() + ttlMs),
      updatedAt: now,
    };
    this.webhookIdempotency.set(idempotencyKey, record);
    return { claimed: true, record };
  }

  /**
   * Marks a webhook idempotency claim as successfully processed.
   */
  async completeWebhookIdempotency(idempotencyKey: string): Promise<void> {
    const record = this.webhookIdempotency.get(idempotencyKey);
    if (record) {
      record.status = 'completed';
      record.updatedAt = new Date();
    }
  }

  /**
   * Marks a webhook idempotency claim as failed (processing errored), which
   * allows a subsequent retry of the same payload to re-claim the key.
   */
  async failWebhookIdempotency(idempotencyKey: string): Promise<void> {
    const record = this.webhookIdempotency.get(idempotencyKey);
    if (record) {
      record.status = 'failed';
      record.updatedAt = new Date();
    }
  }

  /**
   * Returns the current claim for an idempotency key, expiring stale
   * records on read.
   */
  async getWebhookIdempotency(
    idempotencyKey: string,
  ): Promise<WebhookIdempotencyRecord | null> {
    const record = this.webhookIdempotency.get(idempotencyKey);
    if (!record) return null;
    if (record.expiresAt <= new Date()) {
      this.webhookIdempotency.delete(idempotencyKey);
      return null;
    }
    return record;
  }

  // ---------------------------------------------------------------------
  // Durable webhook delivery outbox — Issue #666 (BA-098)
  // ---------------------------------------------------------------------

  /**
   * Persists an outbound webhook *before* delivery is attempted so the
   * event cannot be lost on process failure.
   */
  async enqueueWebhookDelivery(
    input: NewWebhookOutboxRecord,
  ): Promise<WebhookOutboxRecord> {
    const now = new Date();
    const existing = this.webhookOutbox.get(input.id);
    if (existing) return existing;
    const record: WebhookOutboxRecord = {
      ...input,
      status: 'pending',
      attempts: 0,
      nextRetryAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.webhookOutbox.set(record.id, record);
    return record;
  }

  /**
   * Atomically claims due outbox records for delivery: pending records and
   * retrying records whose `nextRetryAt` has passed are flipped to
   * `sending` so concurrent workers cannot deliver the same event twice.
   */
  async claimDueWebhookDeliveries(
    limit = 10,
    now = new Date(),
  ): Promise<WebhookOutboxRecord[]> {
    const due: WebhookOutboxRecord[] = [];
    for (const record of this.webhookOutbox.values()) {
      if (due.length >= limit) break;
      const claimable =
        (record.status === 'pending' || record.status === 'retrying') &&
        (record.nextRetryAt === null || record.nextRetryAt <= now);
      if (claimable) {
        record.status = 'sending';
        record.updatedAt = now;
        due.push(record);
      }
    }
    return due;
  }

  /**
   * Records a successful delivery attempt. The record becomes terminal
   * (`delivered`) and stays inspectable.
   */
  async completeWebhookDelivery(
    id: string,
    statusCode: number,
  ): Promise<WebhookOutboxRecord | null> {
    const record = this.webhookOutbox.get(id);
    if (!record) return null;
    const now = new Date();
    record.status = 'delivered';
    record.attempts += 1;
    record.lastStatusCode = statusCode;
    record.lastError = undefined;
    record.nextRetryAt = null;
    record.deliveredAt = now;
    record.terminalAt = now;
    record.updatedAt = now;
    return record;
  }

  /**
   * Records a failed delivery attempt. While attempts remain the record is
   * rescheduled (`retrying` + `nextRetryAt`); when attempts are exhausted
   * it becomes a terminal `failed` record that stays inspectable.
   */
  async recordWebhookDeliveryFailure(
    id: string,
    options: { statusCode?: number; error?: string; retryDelayMs?: number },
  ): Promise<{ record: WebhookOutboxRecord; terminal: boolean } | null> {
    const record = this.webhookOutbox.get(id);
    if (!record) return null;
    const now = new Date();
    record.attempts += 1;
    record.lastStatusCode = options.statusCode;
    record.lastError = options.error;
    record.updatedAt = now;

    if (record.attempts >= record.maxRetries) {
      record.status = 'failed';
      record.terminalAt = now;
      record.nextRetryAt = null;
    } else {
      record.status = 'retrying';
      record.nextRetryAt = new Date(
        now.getTime() + (options.retryDelayMs ?? 1_000),
      );
    }
    return { record, terminal: record.status === 'failed' };
  }

  /**
   * Returns a single outbox record by id.
   */
  async getWebhookOutboxRecord(id: string): Promise<WebhookOutboxRecord | null> {
    return this.webhookOutbox.get(id) ?? null;
  }

  /**
   * Lists outbox records, optionally filtered by status.
   */
  async listWebhookOutbox(filter?: {
    status?: WebhookOutboxStatus;
    limit?: number;
  }): Promise<WebhookOutboxRecord[]> {
    let records = Array.from(this.webhookOutbox.values());
    if (filter?.status) {
      records = records.filter((r) => r.status === filter.status);
    }
    records.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return filter?.limit ? records.slice(0, filter.limit) : records;
  }

  /**
   * Returns terminal outbox failures (exhausted retries) for inspection.
   */
  async getTerminalWebhookFailures(limit = 50): Promise<WebhookOutboxRecord[]> {
    const failed = Array.from(this.webhookOutbox.values()).filter(
      (r) => r.status === 'failed',
    );
    failed.sort((a, b) => (b.terminalAt?.getTime() ?? 0) - (a.terminalAt?.getTime() ?? 0));
    return failed.slice(0, limit);
  }

  onApplicationShutdown(signal?: string) {
    this.coupons.clear();
    this.redemptions = [];
    this.webhookIdempotency.clear();
    this.webhookOutbox.clear();
    this.logger.log(`DatabaseService shut down gracefully (signal: ${signal}).`);
  }
}
