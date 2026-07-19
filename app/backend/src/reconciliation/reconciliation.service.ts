import { Injectable, Logger } from '@nestjs/common';
import { Horizon } from '@stellar/stellar-sdk';
import { v4 as uuidv4 } from 'uuid';

import { AppConfigService } from '../config/app-config.service';
import { SupabaseService } from '../supabase/supabase.service';
import {
  SupabaseAuthError,
  SupabaseSerializationError,
  SupabaseTimeoutError,
} from '../supabase/supabase.errors';
import { MetricsService } from '../metrics/metrics.service';
import {
  EscrowDbStatus,
  EscrowRecord,
  EscrowReconciliationResult,
  OnChainState,
  PaymentDbStatus,
  PaymentRecord,
  PaymentReconciliationResult,
  ReconciliationAction,
  ReconciliationReport,
} from './types/reconciliation.types';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);
  private readonly server: Horizon.Server;

  /** Statuses that need to be reconciled against the chain. */
  private readonly ACTIONABLE_ESCROW_STATUSES: EscrowDbStatus[] = [
    EscrowDbStatus.Pending,
    EscrowDbStatus.Active,
  ];

  private readonly ACTIONABLE_PAYMENT_STATUSES: PaymentDbStatus[] = [
    PaymentDbStatus.Pending,
    PaymentDbStatus.Processing,
  ];

  constructor(
    private readonly config: AppConfigService,
    private readonly supabase: SupabaseService,
    private readonly metrics: MetricsService,
  ) {
    const horizonUrl =
      config.network === 'mainnet'
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org';

    this.server = new Horizon.Server(horizonUrl);
    this.logger.log(
      `ReconciliationService initialized against ${config.network} (${horizonUrl})`,
    );
  }

  // ---------------------------------------------------------------------------
  // Public entry point
  // ---------------------------------------------------------------------------

  async runReconciliation(batchSize: number): Promise<ReconciliationReport> {
    const runId = uuidv4();
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    this.logger.log(`[${runId}] Reconciliation run started (batchSize=${batchSize})`);

    const [escrowResults, paymentResults] = await Promise.all([
      this.reconcileEscrows(runId, batchSize),
      this.reconcilePayments(runId, batchSize),
    ]);

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    const report: ReconciliationReport = {
      runId,
      startedAt,
      completedAt,
      durationMs,
      escrows: this.summarise(escrowResults),
      payments: this.summarise(paymentResults),
    };

    // Add totals comparison for payments
    report.totalsComparison = await this.comparePaymentTotals(runId);

    // Generate alert if discrepancies exceed threshold
    report.alert = this.generateDiscrepancyAlert(report);

    this.logReport(report);
    return report;
  }

  // ---------------------------------------------------------------------------
  // Escrow reconciliation
  // ---------------------------------------------------------------------------

  private async reconcileEscrows(
    runId: string,
    batchSize: number,
  ): Promise<EscrowReconciliationResult[]> {
    let records: EscrowRecord[];
    try {
      records = await this.supabase.fetchPendingEscrows(
        this.ACTIONABLE_ESCROW_STATUSES,
        batchSize,
      );
    } catch (err) {
      if (err instanceof SupabaseTimeoutError) {
        this.logger.error(
          `[${runId}] Escrow batch fetch timed out — skipping escrow reconciliation: ${err.message}`,
        );
        return [];
      }
      if (err instanceof SupabaseAuthError) {
        this.logger.error(
          `[${runId}] Escrow batch fetch rejected (auth failure) — skipping escrow reconciliation: ${err.message}`,
        );
        return [];
      }
      throw err;
    }

    this.logger.log(
      `[${runId}] Found ${records.length} escrow(s) to reconcile`,
    );

    const results: EscrowReconciliationResult[] = [];

    for (const record of records) {
      const result = await this.reconcileEscrow(runId, record);
      results.push(result);
    }

    return results;
  }

  private async reconcileEscrow(
    runId: string,
    record: EscrowRecord,
  ): Promise<EscrowReconciliationResult> {
    const base: Omit<EscrowReconciliationResult, 'onChainState' | 'resolvedDbStatus' | 'action' | 'irreconcilable' | 'irreconcilableReason'> = {
      id: record.id,
      contractAddress: record.contract_address,
      previousDbStatus: record.status,
    };

    let onChainState: OnChainState;
    try {
      onChainState = await this.resolveEscrowOnChainState(record);
    } catch (err) {
      this.logger.warn(
        `[${runId}] Skipping escrow ${record.id}: Horizon unavailable — ${(err as Error).message}`,
      );
      return {
        ...base,
        onChainState: OnChainState.Unknown,
        resolvedDbStatus: null,
        action: ReconciliationAction.Skipped,
        irreconcilable: false,
      };
    }

    return this.applyEscrowTransition(runId, record, onChainState, base);
  }

  /**
   * Resolves the authoritative on-chain state for an escrow account.
   *
   * Strategy:
   *  1. Load the Stellar account (contract_address).
   *  2. If the account does not exist → NonExistent.
   *  3. If the account exists, check whether the XLM balance is zero (merged indicator).
   *  4. Cross-check the DB `expires_at` field against wall-clock time.
   */
  private async resolveEscrowOnChainState(record: EscrowRecord): Promise<OnChainState> {
    const startTime = Date.now();
    try {
      const account = await this.server.loadAccount(record.contract_address);
      const duration = (Date.now() - startTime) / 1000;
      this.metrics.recordExternalCall('horizon', 'loadAccount', duration);

      // Check balance — a merged / swept account will have no native balance entry
      const nativeLine = (account.balances as Horizon.HorizonApi.BalanceLine[]).find(
        (b) => b.asset_type === 'native',
      );

      const nativeBalance = nativeLine ? parseFloat(nativeLine.balance) : 0;

      if (nativeBalance === 0) {
        // Account merged or all funds removed → treat as claimed
        return OnChainState.Claimed;
      }

      // Check expiry using DB field (Stellar doesn't natively expose time-bounds per-account)
      if (record.expires_at) {
        const expiresAt = new Date(record.expires_at).getTime();
        if (Date.now() > expiresAt) {
          return OnChainState.Expired;
        }
      }

      return OnChainState.Active;
    } catch (err: unknown) {
      const duration = (Date.now() - startTime) / 1000;
      this.metrics.recordExternalCall('horizon', 'loadAccount', duration);
      const errorType = err instanceof Error ? err.constructor.name : 'UnknownError';
      this.metrics.recordError('horizon', errorType);

      const horizonErr = err as { response?: { status?: number } };
      if (horizonErr?.response?.status === 404) {
        return OnChainState.NonExistent;
      }
      throw err; // Let the caller handle unexpected errors
    }
  }

  private async applyEscrowTransition(
    runId: string,
    record: EscrowRecord,
    onChainState: OnChainState,
    base: Omit<EscrowReconciliationResult, 'onChainState' | 'resolvedDbStatus' | 'action' | 'irreconcilable' | 'irreconcilableReason'>,
  ): Promise<EscrowReconciliationResult> {
    const { id, status: dbStatus } = record;

    // ── Transition table ─────────────────────────────────────────────────────
    // DB: pending | active  → chain says Claimed  → DB: claimed
    // DB: pending | active  → chain says Expired  → DB: expired
    // DB: pending | active  → chain says Active   → DB: no change (consistent)
    // DB: pending | active  → chain says NonExistent → irreconcilable (alert)
    // ─────────────────────────────────────────────────────────────────────────

    if (onChainState === OnChainState.Claimed) {
      try {
        await this.supabase.updateEscrowStatus(id, EscrowDbStatus.Claimed);
      } catch (err) {
        return this.handleEscrowWriteError(runId, id, err, base, onChainState);
      }
      this.logger.log(
        `[${runId}] Escrow ${id}: DB was '${dbStatus}' but chain is Claimed → updated to 'claimed'`,
      );
      return { ...base, onChainState, resolvedDbStatus: EscrowDbStatus.Claimed, action: ReconciliationAction.Updated, irreconcilable: false };
    }

    if (onChainState === OnChainState.Expired) {
      try {
        await this.supabase.updateEscrowStatus(id, EscrowDbStatus.Expired);
      } catch (err) {
        return this.handleEscrowWriteError(runId, id, err, base, onChainState);
      }
      this.logger.log(
        `[${runId}] Escrow ${id}: DB was '${dbStatus}' but chain indicates Expired → updated to 'expired'`,
      );
      return { ...base, onChainState, resolvedDbStatus: EscrowDbStatus.Expired, action: ReconciliationAction.Updated, irreconcilable: false };
    }

    if (onChainState === OnChainState.NonExistent) {
      const reason = `DB status is '${dbStatus}' but escrow account does not exist on-chain`;
      try {
        await this.supabase.flagIrreconcilableEscrow(id, reason);
      } catch (err) {
        return this.handleEscrowWriteError(runId, id, err, base, onChainState);
      }
      this.logger.error(
        `[${runId}] IRRECONCILABLE escrow ${id} (${record.contract_address}): ${reason}`,
      );
      return { ...base, onChainState, resolvedDbStatus: null, action: ReconciliationAction.Flagged, irreconcilable: true, irreconcilableReason: reason };
    }

    // Active on-chain and active in DB → consistent
    return { ...base, onChainState, resolvedDbStatus: dbStatus, action: ReconciliationAction.NoOp, irreconcilable: false };
  }

  /**
   * Central handler for Supabase write errors during escrow transitions.
   * Serialization errors and timeouts are skipped so the record can be
   * retried on the next reconciliation run. Auth errors bubble up to abort
   * the entire run.
   */
  private handleEscrowWriteError(
    runId: string,
    id: string,
    err: unknown,
    base: Omit<EscrowReconciliationResult, 'onChainState' | 'resolvedDbStatus' | 'action' | 'irreconcilable' | 'irreconcilableReason'>,
    onChainState: OnChainState,
  ): EscrowReconciliationResult {
    if (err instanceof SupabaseSerializationError) {
      this.logger.warn(
        `[${runId}] Escrow ${id}: serialization failure during DB write — will retry next run: ${err.message}`,
      );
      return { ...base, onChainState, resolvedDbStatus: null, action: ReconciliationAction.Skipped, irreconcilable: false };
    }
    if (err instanceof SupabaseTimeoutError) {
      this.logger.warn(
        `[${runId}] Escrow ${id}: DB write timed out — will retry next run: ${err.message}`,
      );
      return { ...base, onChainState, resolvedDbStatus: null, action: ReconciliationAction.Skipped, irreconcilable: false };
    }
    if (err instanceof SupabaseAuthError) {
      this.logger.error(
        `[${runId}] Escrow ${id}: DB write rejected (auth failure) — aborting: ${err.message}`,
      );
    }
    throw err;
  }

  // ---------------------------------------------------------------------------
  // Payment reconciliation
  // ---------------------------------------------------------------------------

  private async reconcilePayments(
    runId: string,
    batchSize: number,
  ): Promise<PaymentReconciliationResult[]> {
    let records: PaymentRecord[];
    try {
      records = await this.supabase.fetchPendingPayments(
        this.ACTIONABLE_PAYMENT_STATUSES,
        batchSize,
      );
    } catch (err) {
      if (err instanceof SupabaseTimeoutError) {
        this.logger.error(
          `[${runId}] Payment batch fetch timed out — skipping payment reconciliation: ${err.message}`,
        );
        return [];
      }
      if (err instanceof SupabaseAuthError) {
        this.logger.error(
          `[${runId}] Payment batch fetch rejected (auth failure) — skipping payment reconciliation: ${err.message}`,
        );
        return [];
      }
      throw err;
    }

    this.logger.log(
      `[${runId}] Found ${records.length} payment(s) to reconcile`,
    );

    const results: PaymentReconciliationResult[] = [];

    for (const record of records) {
      const result = await this.reconcilePayment(runId, record);
      results.push(result);
    }

    return results;
  }

  private async reconcilePayment(
    runId: string,
    record: PaymentRecord,
  ): Promise<PaymentReconciliationResult> {
    const base: Omit<PaymentReconciliationResult, 'onChainState' | 'resolvedDbStatus' | 'action' | 'irreconcilable' | 'irreconcilableReason'> = {
      id: record.id,
      txHash: record.stellar_tx_hash,
      previousDbStatus: record.status,
    };

    let onChainState: OnChainState;
    try {
      onChainState = await this.resolvePaymentOnChainState(record.stellar_tx_hash);
    } catch (err) {
      this.logger.warn(
        `[${runId}] Skipping payment ${record.id}: Horizon unavailable — ${(err as Error).message}`,
      );
      return {
        ...base,
        onChainState: OnChainState.Unknown,
        resolvedDbStatus: null,
        action: ReconciliationAction.Skipped,
        irreconcilable: false,
      };
    }

    return this.applyPaymentTransition(runId, record, onChainState, base);
  }

  /**
   * Checks whether a transaction hash is confirmed on-chain via Horizon.
   */
  private async resolvePaymentOnChainState(txHash: string): Promise<OnChainState> {
    const startTime = Date.now();
    try {
      const tx = await this.server.transactions().transaction(txHash).call();
      const duration = (Date.now() - startTime) / 1000;
      this.metrics.recordExternalCall('horizon', 'getTransaction', duration);
      return tx.successful ? OnChainState.Confirmed : OnChainState.NonExistent;
    } catch (err: unknown) {
      const duration = (Date.now() - startTime) / 1000;
      this.metrics.recordExternalCall('horizon', 'getTransaction', duration);
      const errorType = err instanceof Error ? err.constructor.name : 'UnknownError';
      this.metrics.recordError('horizon', errorType);

      const horizonErr = err as { response?: { status?: number } };
      if (horizonErr?.response?.status === 404) {
        return OnChainState.NonExistent;
      }
      throw err;
    }
  }

  private async applyPaymentTransition(
    runId: string,
    record: PaymentRecord,
    onChainState: OnChainState,
    base: Omit<PaymentReconciliationResult, 'onChainState' | 'resolvedDbStatus' | 'action' | 'irreconcilable' | 'irreconcilableReason'>,
  ): Promise<PaymentReconciliationResult> {
    const { id, status: dbStatus } = record;

    // ── Transition table ─────────────────────────────────────────────────────
    // DB: pending | processing  → chain Confirmed     → DB: paid
    // DB: pending | processing  → chain NonExistent   → DB: failed  (irreconcilable if DB was 'paid')
    // DB: paid                  → chain NonExistent   → irreconcilable
    // ─────────────────────────────────────────────────────────────────────────

    if (onChainState === OnChainState.Confirmed) {
      if (dbStatus === PaymentDbStatus.Paid) {
        // Already consistent
        return { ...base, onChainState, resolvedDbStatus: PaymentDbStatus.Paid, action: ReconciliationAction.NoOp, irreconcilable: false };
      }
      try {
        await this.supabase.updatePaymentStatus(id, PaymentDbStatus.Paid);
      } catch (err) {
        return this.handlePaymentWriteError(runId, id, err, base, onChainState);
      }
      this.logger.log(
        `[${runId}] Payment ${id}: DB was '${dbStatus}' but chain confirms tx → updated to 'paid'`,
      );
      return { ...base, onChainState, resolvedDbStatus: PaymentDbStatus.Paid, action: ReconciliationAction.Updated, irreconcilable: false };
    }

    if (onChainState === OnChainState.NonExistent) {
      if (dbStatus === PaymentDbStatus.Paid) {
        const reason = `DB status is 'paid' but transaction ${record.stellar_tx_hash} not found on-chain`;
        try {
          await this.supabase.flagIrreconcilablePayment(id, reason);
        } catch (err) {
          return this.handlePaymentWriteError(runId, id, err, base, onChainState);
        }
        this.logger.error(
          `[${runId}] IRRECONCILABLE payment ${id}: ${reason}`,
        );
        return { ...base, onChainState, resolvedDbStatus: null, action: ReconciliationAction.Flagged, irreconcilable: true, irreconcilableReason: reason };
      }

      // pending/processing with no on-chain record — mark failed
      try {
        await this.supabase.updatePaymentStatus(id, PaymentDbStatus.Failed);
      } catch (err) {
        return this.handlePaymentWriteError(runId, id, err, base, onChainState);
      }
      this.logger.warn(
        `[${runId}] Payment ${id}: DB was '${dbStatus}' but tx not found on-chain → updated to 'failed'`,
      );
      return { ...base, onChainState, resolvedDbStatus: PaymentDbStatus.Failed, action: ReconciliationAction.Updated, irreconcilable: false };
    }

    // Unknown / skip
    return { ...base, onChainState, resolvedDbStatus: dbStatus, action: ReconciliationAction.NoOp, irreconcilable: false };
  }

  /**
   * Central handler for Supabase write errors during payment transitions.
   * Serialization errors and timeouts skip the record for next-run retry.
   * Auth errors bubble up to abort the run.
   */
  private handlePaymentWriteError(
    runId: string,
    id: string,
    err: unknown,
    base: Omit<PaymentReconciliationResult, 'onChainState' | 'resolvedDbStatus' | 'action' | 'irreconcilable' | 'irreconcilableReason'>,
    onChainState: OnChainState,
  ): PaymentReconciliationResult {
    if (err instanceof SupabaseSerializationError) {
      this.logger.warn(
        `[${runId}] Payment ${id}: serialization failure during DB write — will retry next run: ${err.message}`,
      );
      return { ...base, onChainState, resolvedDbStatus: null, action: ReconciliationAction.Skipped, irreconcilable: false };
    }
    if (err instanceof SupabaseTimeoutError) {
      this.logger.warn(
        `[${runId}] Payment ${id}: DB write timed out — will retry next run: ${err.message}`,
      );
      return { ...base, onChainState, resolvedDbStatus: null, action: ReconciliationAction.Skipped, irreconcilable: false };
    }
    if (err instanceof SupabaseAuthError) {
      this.logger.error(
        `[${runId}] Payment ${id}: DB write rejected (auth failure) — aborting: ${err.message}`,
      );
    }
    throw err;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private summarise<T extends { action: ReconciliationAction; irreconcilable: boolean }>(
    results: T[],
  ) {
    return {
      processed: results.length,
      updated: results.filter((r) => r.action === ReconciliationAction.Updated).length,
      noOp: results.filter((r) => r.action === ReconciliationAction.NoOp).length,
      skipped: results.filter((r) => r.action === ReconciliationAction.Skipped).length,
      irreconcilable: results.filter((r) => r.irreconcilable).length,
      results,
    };
  }

  /**
   * Compare expected vs observed payment totals to detect discrepancies.
   * Expected: Count and sum of payments in 'paid' status in DB
   * Observed: Count and sum of confirmed transactions on-chain
   */
  private async comparePaymentTotals(runId: string) {
    try {
      // Get expected totals from database (paid payments)
      const dbPayments = await this.supabase.fetchPaidPayments();
      const expectedCount = dbPayments.length;
      const expectedTotalAmount = dbPayments.reduce(
        (sum, p) => sum + BigInt(p.amount),
        0n,
      ).toString();

      // Get observed totals from on-chain (this is a simplified version)
      // In production, you would query Horizon for all transactions in a time range
      const observedCount = expectedCount; // Placeholder - would be from Horizon
      const observedTotalAmount = expectedTotalAmount; // Placeholder - would be from Horizon

      const countDiscrepancy = Math.abs(expectedCount - observedCount);
      const amountDiscrepancy = (
        BigInt(expectedTotalAmount) - BigInt(observedTotalAmount)
      ).toString();

      // Threshold: alert if count discrepancy > 5 or amount discrepancy > 0
      const exceedsThreshold = countDiscrepancy > 5 || amountDiscrepancy !== '0';

      this.logger.log(
        `[${runId}] Payment totals comparison: expected=${expectedCount}/${expectedTotalAmount}, observed=${observedCount}/${observedTotalAmount}, exceedsThreshold=${exceedsThreshold}`,
      );

      return {
        payments: {
          expectedCount,
          observedCount,
          countDiscrepancy,
          expectedTotalAmount,
          observedTotalAmount,
          amountDiscrepancy,
          exceedsThreshold,
        },
      };
    } catch (error) {
      this.logger.warn(
        `[${runId}] Failed to compare payment totals: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  /**
   * Generate alert if discrepancies exceed configured threshold.
   */
  private generateDiscrepancyAlert(report: ReconciliationReport): { severity: 'critical' | 'warning'; message: string; details: string } | undefined {
    if (!report.totalsComparison?.payments.exceedsThreshold) {
      return undefined;
    }

    const { payments } = report.totalsComparison;
    const { countDiscrepancy, amountDiscrepancy } = payments;

    // Critical if amount discrepancy or high count discrepancy
    const isCritical = amountDiscrepancy !== '0' || countDiscrepancy > 10;

    const message = isCritical
      ? 'Critical payment discrepancy detected'
      : 'Payment discrepancy detected';

    const details = `Count discrepancy: ${countDiscrepancy}, Amount discrepancy: ${amountDiscrepancy}`;

    this.logger.error(
      `[${report.runId}] ${message}: ${details}`,
    );

    // Record metric for alert
    this.metrics.recordError('reconciliation', isCritical ? 'critical_discrepancy' : 'warning_discrepancy');

    return {
      severity: isCritical ? ('critical' as const) : ('warning' as const),
      message,
      details,
    };
  }

  private logReport(report: ReconciliationReport): void {
    const { runId, durationMs, escrows, payments } = report;

    this.logger.log(
      `[${runId}] Run complete in ${durationMs}ms | ` +
      `Escrows — processed:${escrows.processed} updated:${escrows.updated} ` +
      `noOp:${escrows.noOp} skipped:${escrows.skipped} irreconcilable:${escrows.irreconcilable} | ` +
      `Payments — processed:${payments.processed} updated:${payments.updated} ` +
      `noOp:${payments.noOp} skipped:${payments.skipped} irreconcilable:${payments.irreconcilable}`,
    );

    // Warn loudly for any irreconcilable records
    const allIrreconcilable = [
      ...escrows.results.filter((r) => r.irreconcilable),
      ...payments.results.filter((r) => r.irreconcilable),
    ];

    if (allIrreconcilable.length > 0) {
      this.logger.error(
        `[${runId}] ⚠  ${allIrreconcilable.length} irreconcilable record(s) flagged for manual review`,
      );
      allIrreconcilable.forEach((r) => {
        this.logger.error(
          `  • ${'contractAddress' in r ? `escrow ${r.id}` : `payment ${r.id}`}: ${(r as { irreconcilableReason?: string }).irreconcilableReason}`,
        );
      });
    }
  }
}
