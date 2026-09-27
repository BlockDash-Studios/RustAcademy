/**
 * Error Queue: Stores errors that occur while offline and retries them when connection restored.
 * Uses IndexedDB for persistent storage with automatic sync on reconnection.
 */

export interface QueuedError {
  id: string;
  payload: unknown;
  timestamp: number;
  retries: number;
  maxRetries: number;
}

const DB_NAME = "rustacademy-error-queue";
const DB_VERSION = 1;
const STORE_NAME = "errors";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000; // 5 seconds

let db: IDBDatabase | null = null;

/**
 * Initialize IndexedDB for error queueing
 */
async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error("Failed to open IndexedDB for error queue"));
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

/**
 * Add error to queue
 */
export async function queueError(payload: unknown): Promise<string> {
  try {
    const database = await initDB();
    const id = `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const error: QueuedError = {
      id,
      payload,
      timestamp: Date.now(),
      retries: 0,
      maxRetries: MAX_RETRIES,
    };

    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(error);

      request.onerror = () => reject(new Error("Failed to queue error"));
      request.onsuccess = () => resolve(id);
    });
  } catch (err) {
    console.warn("Error queueing failed:", err);
    throw err;
  }
}

/**
 * Get all queued errors
 */
export async function getQueuedErrors(): Promise<QueuedError[]> {
  try {
    const database = await initDB();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(new Error("Failed to retrieve queued errors"));
      request.onsuccess = () => resolve(request.result);
    });
  } catch (err) {
    console.warn("Failed to get queued errors:", err);
    return [];
  }
}

/**
 * Remove error from queue
 */
export async function removeQueuedError(id: string): Promise<void> {
  try {
    const database = await initDB();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onerror = () => reject(new Error("Failed to remove queued error"));
      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.warn("Failed to remove queued error:", err);
  }
}

/**
 * Update retry count for error
 */
export async function updateErrorRetries(id: string, retries: number): Promise<void> {
  try {
    const database = await initDB();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onerror = () => reject(new Error("Failed to update error retries"));

      getRequest.onsuccess = () => {
        const error = getRequest.result;
        if (error) {
          error.retries = retries;
          const updateRequest = store.put(error);
          updateRequest.onerror = () =>
            reject(new Error("Failed to update error retries"));
          updateRequest.onsuccess = () => resolve();
        }
      };
    });
  } catch (err) {
    console.warn("Failed to update error retries:", err);
  }
}

/**
 * Clear all queued errors
 */
export async function clearErrorQueue(): Promise<void> {
  try {
    const database = await initDB();

    return new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(new Error("Failed to clear error queue"));
      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.warn("Failed to clear error queue:", err);
  }
}

/**
 * Retry sending queued errors (called when connectivity restored)
 */
export async function retryQueuedErrors(
  submitFn: (payload: unknown) => Promise<void>
): Promise<void> {
  const errors = await getQueuedErrors();

  if (errors.length === 0) return;

  for (const error of errors) {
    try {
      // Only retry if under max attempts
      if (error.retries >= error.maxRetries) {
        await removeQueuedError(error.id);
        continue;
      }

      await submitFn(error.payload);
      await removeQueuedError(error.id);
    } catch (err) {
      // Increment retry count
      await updateErrorRetries(error.id, error.retries + 1);

      // If max retries reached, remove from queue
      if (error.retries + 1 >= error.maxRetries) {
        await removeQueuedError(error.id);
        console.warn(
          `Error dropped after ${error.maxRetries} retries:`,
          error.payload
        );
      }
    }
  }
}
