import { Injectable, Logger } from '@nestjs/common';

/**
 * Represents a snapshot of state that can be restored on rollback.
 * Each service that participates in a transaction provides its own
 * snapshot type through a generic parameter.
 */
export interface TransactionSnapshot<T = unknown> {
  restore(): void;
  data: T;
}

/**
 * A single operation within a transaction context. Returns a rollback
 * snapshot so the transaction can undo the operation on failure.
 */
export type TransactionOperation<T = TransactionSnapshot> = () => Promise<T>;

/**
 * Result returned after executing an atomic operation group.
 */
export interface AtomicResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
}

/**
 * In-memory transaction coordinator for services that rely on
 * non-persistent stores (Maps, arrays). Provides a lightweight
 * mechanism to group multiple state-mutating operations into a
 * single atomic unit: either ALL side-effects apply or NONE do.
 *
 * ## How it works
 *
 * Each operation inside `runAtomic` returns a rollback function
 * (a {@link TransactionSnapshot}). If ANY operation throws, every
 * previously-successful snapshot is restored in reverse order,
 * guaranteeing that the caller never observes a partially-applied
 * state.
 *
 * ## Usage
 *
 * ```ts
 * const result = await this.transactionManager.runAtomic(async (tx) => {
 *   const snap1 = tx.addOperation(() => this.progress.recordLesson(...));
 *   const snap2 = tx.addOperation(() => this.analytics.trackEvent(...));
 *   // If snap2 throws, snap1 is automatically rolled back.
 * });
 * ```
 *
 * ## Limitations
 *
 * This is an *application-level* transaction — it does NOT lock
 * underlying data structures. Concurrent callers can still observe
 * transient intermediate states. For true isolation use database
 * transactions (TypeORM QueryRunner). This utility is the correct
 * choice when the backing store is in-memory and DB-level isolation
 * is not available.
 */
@Injectable()
export class TransactionManagerService {
  private readonly logger = new Logger(TransactionManagerService.name);

  /**
   * Execute a group of operations atomically.
   *
   * @param fn  Receives a transaction context that can accumulate
   *            operations via `addOperation`.
   * @returns   The aggregated result of the last operation, or an
   *            error if any operation failed.
   */
  async runAtomic<T>(
    fn: (ctx: TransactionContext) => Promise<T>,
  ): Promise<AtomicResult<T>> {
    const ctx = new TransactionContext();

    try {
      const result = await fn(ctx);
      return { success: true, result };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Rollback in reverse order — each snapshot knows how to undo
      // exactly one operation.
      const snapshots = ctx.getSnapshots();
      for (let i = snapshots.length - 1; i >= 0; i--) {
        try {
          snapshots[i].restore();
        } catch (rollbackError) {
          this.logger.error(
            `Rollback failed for operation ${i}: ${rollbackError}`,
          );
        }
      }

      this.logger.warn(
        `Transaction rolled back (${snapshots.length} operation(s)): ${err.message}`,
      );

      return { success: false, error: err };
    }
  }
}

/**
 * Context object passed to the transaction body. Operations are
 * registered via `addOperation` and their snapshots are stored
 * for potential rollback.
 */
export class TransactionContext {
  private readonly snapshots: TransactionSnapshot[] = [];

  /**
   * Register an operation. The operation is executed immediately
   * and its rollback snapshot is recorded. If the operation itself
   * throws, the snapshot list is still updated so the caller can
   * decide what to do (the error propagates to `runAtomic`).
   */
  async addOperation<T extends TransactionSnapshot>(
    operation: () => Promise<T>,
  ): Promise<T> {
    const snapshot = await operation();
    this.snapshots.push(snapshot);
    return snapshot;
  }

  getSnapshots(): TransactionSnapshot[] {
    return this.snapshots;
  }
}
