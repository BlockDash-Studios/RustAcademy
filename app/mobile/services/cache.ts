import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TransactionItem, TransactionResponse } from '../types/transaction';

// Key prefixes used to namespace cached entries in AsyncStorage by kind
// (transactions vs. profile data), each further suffixed with an account id.
const TRANSACTIONS_CACHE_KEY_PREFIX = '@qex_tx_cache_';
const PROFILE_CACHE_KEY_PREFIX = '@qex_profile_cache_';

/**
 * Saves transactions for a specific account to the local cache.
 * Wraps the data with a timestamp so it can later be checked for
 * staleness (see invalidateOldCache). Failures are logged but not
 * thrown, since caching is a best-effort optimization rather than a
 * critical path.
 */
export async function saveTransactionsToCache(accountId: string, data: TransactionResponse): Promise<void> {
    try {
        const cacheEntry = {
            data,
            timestamp: Date.now(),
        };
        await AsyncStorage.setItem(`${TRANSACTIONS_CACHE_KEY_PREFIX}${accountId}`, JSON.stringify(cacheEntry));
    } catch (err) {
        console.error('Failed to save transactions to cache', err);
    }
}

/**
 * Retrieves cached transactions for a specific account.
 * Returns null if no cache is found.
 */
export async function getTransactionsFromCache(accountId: string): Promise<TransactionResponse | null> {
    try {
        const raw = await AsyncStorage.getItem(`${TRANSACTIONS_CACHE_KEY_PREFIX}${accountId}`);
        if (!raw) return null;
        
        const entry = JSON.parse(raw);
        return entry.data;
    } catch (err) {
        console.error('Failed to get transactions from cache', err);
        return null;
    }
}

/**
 * Searches all cached transaction responses for a specific transaction by pagingToken.
 * Returns the matching TransactionItem or null if not found.
 * Useful when looking up a single transaction's details without knowing
 * in advance which account's cache it belongs to (e.g. from a
 * notification or deep link).
 */
export async function findTransactionInCache(
    pagingToken: string,
): Promise<TransactionItem | null> {
    try {
        // Scan every cached transactions entry across all accounts, since
        // the caller only has a pagingToken and not an account id.
        const keys = await AsyncStorage.getAllKeys();
        const cacheKeys = keys.filter((k) =>
            k.startsWith(TRANSACTIONS_CACHE_KEY_PREFIX),
        );

        for (const key of cacheKeys) {
            const raw = await AsyncStorage.getItem(key);
            if (!raw) continue;
            const entry = JSON.parse(raw) as {
                data: TransactionResponse;
                timestamp: number;
            };
            const match = entry.data.items.find(
                (item) => item.pagingToken === pagingToken,
            );
            // Return as soon as a match is found, rather than scanning
            // every remaining cached account's data unnecessarily.
            if (match) return match;
        }
        return null;
    } catch (err) {
        console.error('Failed to find transaction in cache', err);
        return null;
    }
}

/**
 * Simple cache invalidation: clears data older than 7 days.
 * Sweeps both transaction and profile cache entries (across all
 * accounts) and removes any whose stored timestamp is older than the
 * 7-day threshold, to keep AsyncStorage from accumulating stale data
 * indefinitely.
 */
export async function invalidateOldCache(): Promise<void> {
    try {
        const keys = await AsyncStorage.getAllKeys();
        const cacheKeys = keys.filter(k => k.startsWith(TRANSACTIONS_CACHE_KEY_PREFIX) || k.startsWith(PROFILE_CACHE_KEY_PREFIX));
        
        const now = Date.now();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        
        for (const key of cacheKeys) {
            const raw = await AsyncStorage.getItem(key);
            if (raw) {
                const entry = JSON.parse(raw);
                if (now - entry.timestamp > sevenDaysMs) {
                    await AsyncStorage.removeItem(key);
                }
            }
        }
    } catch (err) {
        console.error('Failed to invalidate old cache', err);
    }
}