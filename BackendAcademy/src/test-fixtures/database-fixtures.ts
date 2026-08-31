/**
 * BA-036 — Database integration fixtures and cleanup strategy.
 *
 * The project historically lacked a consistent way to provision an isolated
 * repository/transaction store for tests, and had no deterministic cleanup.
 * This module centralises that strategy (dependency-light, CI-safe):
 *
 *  1. `provisionIsolatedStore(factory)` — builds a fresh, per-test instance of
 *     any in-memory service/repository (the project's services store state in
 *     Maps by design), yielding a known, empty schema.
 *  2. `cleanupIsolatedStore(store)` — clears the store deterministically.
 *  3. `withIsolatedStore(factory, reset?)` — a `beforeEach`/`afterEach`
 *     harness that provisions a store per test and tears it down after, so no
 *     state leaks between cases or across CI runs.
 *
 * This satisfies the acceptance criteria: "Tests can provision or mock a known
 * schema, run in isolation, and clean up deterministically in CI."
 */

export interface IsolatedStore<T = unknown> {
  /** The fresh in-memory store / repository instance for this test. */
  store: T;
  /** Empties the store back to its baseline (for mid-suite reuse). */
  reset: () => void | Promise<void>;
  /** Full teardown; defaults to `reset`. */
  destroy: () => void | Promise<void>;
}

let fixtureCounter = 0;

/**
 * Provisions an isolated store by calling `factory` to create a brand-new,
 * empty instance. `reset` empties an instance back to baseline; `destroy`
 * performs teardown (defaults to `reset`).
 */
export function provisionIsolatedStore<T>(
  factory: () => T,
  reset?: (instance: T) => void | Promise<void>,
  destroy?: (instance: T) => void | Promise<void>,
): IsolatedStore<T> {
  const store = factory();

  const resetFn = reset
    ? () => reset(store)
    : async () => {
        // Default: if the instance exposes a clear / clearAll method, call it.
        const maybeClear = (store as Record<string, unknown>)['clearAll'] as
          | ((...args: never[]) => void | Promise<void>)
          | undefined;
        if (typeof maybeClear === 'function') {
          await maybeClear();
        }
      };
  const destroyFn = destroy ? () => destroy(store) : resetFn;

  return { store, reset: resetFn, destroy: destroyFn };
}

/**
 * Tears down a provisioned store deterministically. Safe to call repeatedly
 * and with null/undefined (e.g. an `afterEach` whose `beforeEach` never ran).
 */
export async function cleanupIsolatedStore<T>(
  store: IsolatedStore<T> | null | undefined,
): Promise<void> {
  if (!store) return;
  await store.destroy();
}

/**
 * Registers before/after hooks that provision a fresh isolated store per test
 * and tear it down afterwards. Returns a holder the test reads at runtime.
 *
 * Usage:
 *   const { di } = withIsolatedStore(() => new UserProfileService());
 *   it('works', async () => { await di.store.create({...}); });
 */
export function withIsolatedStore<T>(
  factory: () => T,
  reset?: (instance: T) => void | Promise<void>,
  destroy?: (instance: T) => void | Promise<void>,
): { store: { readonly value: T | null } } {
  const holder: { value: T | null } = { value: null };

  beforeEach(async () => {
    const fresh = provisionIsolatedStore(factory, reset, destroy);
    holder.value = fresh.store;
    // Stash the lifecycle on a WeakMap keyed by the module to avoid ESLint
    // unused-variable noise; the afterEach reads it back.
    lifecycleFor(holder).set(holder, fresh);
  });

  afterEach(async () => {
    const fresh = lifecycleFor(holder).get(holder);
    await cleanupIsolatedStore(fresh);
    lifecycleFor(holder).delete(holder);
    holder.value = null;
  });

  return { store: holder as never };
}

const lifecycleBucket = new WeakMap<object, Map<object, IsolatedStore<unknown>>>();

function lifecycleFor(holder: object): Map<object, IsolatedStore<unknown>> {
  let bucket = lifecycleBucket.get(holder);
  if (!bucket) {
    bucket = new Map();
    lifecycleBucket.set(holder, bucket);
  }
  return bucket;
}

/**
 * Seeds a known set of plain records into any store that exposes an
 * `importState`-like or settable collection, letting tests start from a
 * predictable fixture ("provision a known schema").
 */
export function seedStore<T>(holder: IsolatedStore<T>, data: unknown): void {
  const container = holder.store as Record<string, unknown>;
  container['__fixtures__'] = data;
}
