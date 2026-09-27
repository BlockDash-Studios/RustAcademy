/**
 * Correlation Context Service
 *
 * Provides a single source of truth for the correlation identifier across
 * all execution contexts: HTTP requests, background job processing, database
 * operations, and any downstream service calls.
 *
 * Uses Node.js `AsyncLocalStorage` to propagate the correlation ID through
 * the async call stack without explicit parameter threading. This enables
 * operators to follow a single request or background action across the
 * entire NestJS application, queue, and realtime services.
 *
 * Usage:
 *   // Set context (typically done in middleware or job executor)
 *   correlationContext.setCorrelationId('abc-123');
 *
 *   // Get current context (works anywhere in the same async call stack)
 *   const id = correlationContext.getCorrelationId();
 *
 *   // Run a callback with a specific correlation ID
 *   await correlationContext.run('abc-123', async () => {
 *     await someService.doWork();
 *   });
 */

import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Shape of the correlation context stored per async execution.
 */
interface CorrelationStore {
  correlationId: string;
}

@Injectable()
export class CorrelationContextService {
  private readonly storage = new AsyncLocalStorage<CorrelationStore>();

  /**
   * Get the current correlation ID from the async context.
   * Returns `undefined` when called outside any tracked context
   * (e.g. during module initialization or in non-request code).
   */
  getCorrelationId(): string | undefined {
    return this.storage.getStore()?.correlationId;
  }

  /**
   * Set the correlation ID for the current async context.
   * Typically called from the correlation-id middleware (HTTP) or
   * the job executor (background jobs).
   */
  setCorrelationId(correlationId: string): void {
    const store = this.storage.getStore();
    if (store) {
      store.correlationId = correlationId;
    } else {
      // Outside any tracked context — create a new root context.
      this.storage.enterWith({ correlationId });
    }
  }

  /**
   * Run a callback inside a new async context with the given correlation ID.
   * The callback can be async — all `await`ed work inherits the context.
   *
   * @param correlationId - The correlation ID to propagate
   * @param fn            - The callback to execute in context
   * @returns The return value of `fn`
   */
  async run<T>(correlationId: string, fn: () => Promise<T>): Promise<T> {
    return this.storage.run({ correlationId }, fn);
  }

  /**
   * Run a synchronous callback inside a new async context with the given
   * correlation ID. Useful for non-async initialization paths.
   *
   * @param correlationId - The correlation ID to propagate
   * @param fn            - The synchronous callback to execute in context
   * @returns The return value of `fn`
   */
  runSync<T>(correlationId: string, fn: () => T): T {
    return this.storage.run({ correlationId }, fn);
  }
}
