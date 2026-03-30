import { Injectable, Logger } from '@nestjs/common';
import { LRUCache } from 'lru-cache';

// Cache configuration interface
interface CacheConfig {
  max: number;
  ttl: number; // in seconds
}

// Cache entry with metadata
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Performance optimization service using LRU caching.
 * Provides caching for frequently accessed data like API keys,
 * user preferences, and transaction counts.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  
  // Pre-configured cache instances
  private readonly apiKeyCache: LRUCache<string, CacheEntry<unknown>>;
  private readonly userPreferencesCache: LRUCache<string, CacheEntry<unknown>>;
  private readonly assetCache: LRUCache<string, CacheEntry<unknown>>;
  private readonly transactionCountCache: LRUCache<string, CacheEntry<unknown>>;
  private readonly generalCache: LRUCache<string, CacheEntry<unknown>>;

  constructor() {
    // Configure cache sizes and TTLs for different use cases
    this.apiKeyCache = new LRUCache<string, CacheEntry<unknown>>({
      max: 500, // Cache up to 500 API keys
      ttl: 1000 * 60 * 5, // 5 minutes TTL
    });

    this.userPreferencesCache = new LRUCache<string, CacheEntry<unknown>>({
      max: 1000, // Cache up to 1000 user preferences
      ttl: 1000 * 60 * 15, // 15 minutes TTL
    });

    this.assetCache = new LRUCache<string, CacheEntry<unknown>>({
      max: 100, // Cache up to 100 asset definitions
      ttl: 1000 * 60 * 60, // 1 hour TTL
    });

    this.transactionCountCache = new LRUCache<string, CacheEntry<unknown>>({
      max: 1000, // Cache up to 1000 transaction counts
      ttl: 1000 * 60, // 1 minute TTL
    });

    this.generalCache = new LRUCache<string, CacheEntry<unknown>>({
      max: 200, // General purpose cache
      ttl: 1000 * 60 * 5, // 5 minutes TTL
    });
  }

  /**
   * Get a value from cache if it exists and hasn't expired
   */
  get<T>(key: string, cache: LRUCache<string, CacheEntry<unknown>>): T | null {
    const entry = cache.get(key);
    
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set a value in cache with TTL
   */
  set<T>(
    key: string, 
    value: T, 
    cache: LRUCache<string, CacheEntry<unknown>>,
    ttlSeconds?: number
  ): void {
    const ttl = (ttlSeconds || 300) * 1000; // Default 5 minutes
    cache.set(key, {
      data: value,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Delete a specific key from cache
   */
  delete(key: string, cache: LRUCache<string, CacheEntry<unknown>>): void {
    cache.delete(key);
  }

  /**
   * Clear all entries from a specific cache
   */
  clear(cache: LRUCache<string, CacheEntry<unknown>>): void {
    cache.clear();
  }

  /**
   * Get API key cache
   */
  getApiKeyCache(): LRUCache<string, CacheEntry<unknown>> {
    return this.apiKeyCache;
  }

  /**
   * Get user preferences cache
   */
  getUserPreferencesCache(): LRUCache<string, CacheEntry<unknown>> {
    return this.userPreferencesCache;
  }

  /**
   * Get asset cache
   */
  getAssetCache(): LRUCache<string, CacheEntry<unknown>> {
    return this.assetCache;
  }

  /**
   * Get transaction count cache
   */
  getTransactionCountCache(): LRUCache<string, CacheEntry<unknown>> {
    return this.transactionCountCache;
  }

  /**
   * Get general purpose cache
   */
  getGeneralCache(): LRUCache<string, CacheEntry<unknown>> {
    return this.generalCache;
  }

  /**
   * Cache a result with automatic key generation from parameters
   */
  async cacheResult<T>(
    cache: LRUCache<string, CacheEntry<unknown>>,
    key: string,
    ttlSeconds: number,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    const cached = this.get<T>(key, cache);
    if (cached !== null) {
      this.logger.debug(`Cache hit for key: ${key}`);
      return cached;
    }

    this.logger.debug(`Cache miss for key: ${key}, fetching...`);
    const result = await fetchFn();
    this.set(key, result, cache, ttlSeconds);
    return result;
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    apiKeyCache: { size: number; max: number };
    userPreferencesCache: { size: number; max: number };
    assetCache: { size: number; max: number };
    transactionCountCache: { size: number; max: number };
    generalCache: { size: number; max: number };
  } {
    return {
      apiKeyCache: { size: this.apiKeyCache.size, max: this.apiKeyCache.max },
      userPreferencesCache: { size: this.userPreferencesCache.size, max: this.userPreferencesCache.max },
      assetCache: { size: this.assetCache.size, max: this.assetCache.max },
      transactionCountCache: { size: this.transactionCountCache.size, max: this.transactionCountCache.max },
      generalCache: { size: this.generalCache.size, max: this.generalCache.max },
    };
  }
}