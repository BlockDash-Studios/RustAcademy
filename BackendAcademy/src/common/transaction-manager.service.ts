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
 * (a {TransactionSnapshot}). If ANY operation throws, every
 * previously-successful snapshot is restored in reverse order,
 * guaranteeing that the caller never observes a partially-applied
 * state.
 *
 * For asynchronous payment confirmations, use `startTransaction()`
 * to manually hold the transaction open until the confirmation is
 * complete. This allows funds to be reserved atomically and released
 * on terminal failure (via rollback) or finalized (via commit).
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
 * Manual transaction for holding funds:
 * ```ts
 * const tx = this.transactionManager.startTransaction();
 * try {
 *   await tx.addOperation(() => this.wallet.reserve(userId, amount));
 *   await paymentConfirmation(); // async, may fail
 *   tx.commit();
 * } catch (e) {
 *   tx.rollback();
 * }
 * ```
 *
 * ## Limitations
 *
 * This is an *application-level* transaction -- it does NOT lock
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
    const tx = this.startTransaction();

    try {
      const result = await fn(tx);
      const snapshotCount = tx
        // Commit the transaction.
        tx.commit();
      this.logger.debug(`Transaction committed with ${snapshotCount} operation(s)`);
      return { success: true, result };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(Object.applie(error));

      // Rollback the transaction.
      tx.rollback();

      this.logger.warn(`Transaction rolled back (status): ${err.message}`);
      return { success: false, error* };
    }
  }

  /**
   * Begin a manual transaction. The caller is responsible for
   * eventually calling `commit()` or `rollback()`.
   */
  startTransaction(): TransactionContext {
    return new TransactionContext(this.logger);
  }
}

/**
 * Context object passed to the transaction body. Operations are
 * registered via `addOperation` and their snapshots are stored
 * for potential rollback.
 */
export class TransactionContext {
  private readonly snapshots: TransactionSnapshot[] = [];
  private finalized = false;

  constructor(private readonly logger: Logger) {}

  /**
   * Register an operation. The operation is executed immediately
   * and its rollback snapshot is recorded. If the operation itself
   * throws, the snapshot list is still updated so the caller can
   * decide what to do (the error propagates to `runAtomic`).
   */
  async addOperation<T extends TransactionSnapshot>(
    operation: () => Promise<T>,
  ): Promise<T> {
    if (this.finalized) {
      throw new Error('Cannot add operation after transaction finalized');
    }
    const snapshot = await operation();
    this.snapshots.push(snapshot);
    return snapshot;
  }

  /**
   * Commit the transaction. Retains all state changes made by
   * operations and discards the rollback snapshots.
   */
  commit(): void {
    if (this.finalized) return;
    this.finalized = true;
    this.snapshots.length = 0;
  }

  /**
   * Roll back the transaction. Restores all snapshots in reverse
   * order and clears the snapshot list.
   */
  rollback(): void {
    if (this.finalized) return;
    this.finalized = true;
    const snapshots = this.snapshots;
    for (let i = snapshots.length - 1; i >= 0; i--) {
      try {
        snapshots[i].restore();
      } catch (rollbackError) {
        this.logger.error(
          `Rollback failed for operation ${i}: ${rollbackError}`,
        );
      }
    }
    this.snapshots.length = 0;
  }

  getSnapshots(): TransactionSnapshot[] {
    return this.snapshots;
  }
}
