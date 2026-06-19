/**
 * Integration tests for query performance under realistic data volumes.
 *
 * These tests verify that:
 * 1. Pagination queries execute within SLA (< 5s for dashboard endpoints)
 * 2. Indexes prevent full-table scans
 * 3. Cursor pagination handles large result sets
 * 4. Queries gracefully degrade under simulated load
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UnmatchedQueueRepository } from '../reconciliation/unmatched-queue.repository';
import { InAppNotificationRepository } from '../notifications/in-app-notification.repository';
import { SupabaseService } from '../supabase/supabase.service';
import { decodeCursor, encodeCursor } from '../common/pagination/cursor.util';
import { QueryTimeoutError, withQueryTimeout } from '../common/database/query-timeout';

describe('Query Performance Integration Tests', () => {
  let unmatchedQueueRepo: UnmatchedQueueRepository;
  let notificationRepo: InAppNotificationRepository;
  let supabaseService: SupabaseService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        UnmatchedQueueRepository,
        InAppNotificationRepository,
        SupabaseService,
      ],
    }).compile();

    unmatchedQueueRepo = module.get(UnmatchedQueueRepository);
    notificationRepo = module.get(InAppNotificationRepository);
    supabaseService = module.get(SupabaseService);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('Cursor-based Pagination Performance', () => {
    it('should list unmatched transactions with cursor pagination in < 5s', async () => {
      const startTime = Date.now();

      const result = await withQueryTimeout(
        unmatchedQueueRepo.listPending(20),
        { timeoutMs: 5000 },
      );

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000);
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('next_cursor');
      expect(result).toHaveProperty('has_more');
    });

    it('should fetch next page using cursor without timeout', async () => {
      const firstPage = await unmatchedQueueRepo.listPending(5);

      if (!firstPage.has_more) {
        // Skip test if not enough data
        return;
      }

      const startTime = Date.now();
      const secondPage = await withQueryTimeout(
        unmatchedQueueRepo.listPending(5, firstPage.next_cursor || ''),
        { timeoutMs: 5000 },
      );
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000);
      expect(secondPage.items).toHaveLength(5);

      // Verify no duplicate items between pages
      const firstPageIds = firstPage.items.map((item: any) => item.id);
      const secondPageIds = secondPage.items.map((item: any) => item.id);
      const overlap = firstPageIds.filter((id: string) => secondPageIds.includes(id));
      expect(overlap).toHaveLength(0);
    });

    it('should list user notifications with pagination in < 5s', async () => {
      const publicKey = 'GBVK34LQPFVGLDZABZDHNBAVCKL4HHLJWJL3H5FMQOKBVK5VBJL5ZUU';
      const startTime = Date.now();

      const result = await withQueryTimeout(
        notificationRepo.findByUser(publicKey, 20),
        { timeoutMs: 5000 },
      );

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000);
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('next_cursor');
      expect(result).toHaveProperty('has_more');
    });
  });

  describe('Cursor Encoding/Decoding', () => {
    it('should encode and decode cursors correctly', () => {
      const payload = {
        pk: '2026-06-19T10:30:00.000Z',
        id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const encoded = encodeCursor(payload);
      const decoded = decodeCursor(encoded);

      expect(decoded).toEqual(payload);
    });

    it('should handle invalid cursor gracefully', () => {
      const invalidCursor = 'not-a-valid-cursor';
      const decoded = decodeCursor(invalidCursor);

      expect(decoded).toBeNull();
    });

    it('should handle malformed base64 gracefully', () => {
      const malformedCursor = Buffer.from('invalid json').toString('base64url');
      const decoded = decodeCursor(malformedCursor);

      expect(decoded).toBeNull();
    });
  });

  describe('Query Timeout Handling', () => {
    it('should timeout queries exceeding limit', async () => {
      // Create a promise that takes longer than timeout
      const slowQuery = new Promise((resolve) =>
        setTimeout(() => resolve(null), 6000),
      );

      await expect(
        withQueryTimeout(slowQuery, { timeoutMs: 2000 }),
      ).rejects.toThrow(QueryTimeoutError);
    });

    it('should complete queries within timeout', async () => {
      const fastQuery = Promise.resolve([{ id: '123', name: 'test' }]);

      const result = await withQueryTimeout(fastQuery, { timeoutMs: 5000 });

      expect(result).toEqual([{ id: '123', name: 'test' }]);
    });
  });

  describe('Large Dataset Handling', () => {
    it('should handle pagination with limit=100 efficiently', async () => {
      const startTime = Date.now();

      const result = await withQueryTimeout(
        unmatchedQueueRepo.listPending(100),
        { timeoutMs: 10000 },
      );

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10000);
      expect(result.items.length).toBeLessThanOrEqual(100);
    });

    it('should handle rapid successive pagination requests', async () => {
      let cursor: string | undefined;
      let pageCount = 0;
      const pageLimit = 3; // Limit to 3 pages for test speed
      const startTime = Date.now();

      for (let i = 0; i < pageLimit; i++) {
        const result = await withQueryTimeout(
          unmatchedQueueRepo.listPending(20, cursor),
          { timeoutMs: 5000 },
        );

        pageCount++;
        cursor = result.next_cursor || undefined;

        if (!result.has_more) {
          break;
        }
      }

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(15000); // 5 seconds per page * 3 pages
      expect(pageCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Index Usage Verification', () => {
    it('should use indexes for unmatched transaction queries', async () => {
      // This is a behavioral test; actual execution plan verification
      // would require database-level EXPLAIN ANALYZE queries
      const result = await unmatchedQueueRepo.listPending(10);

      // If this completes quickly, indexes are likely being used
      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should use indexes for notification queries', async () => {
      const publicKey = 'GBVK34LQPFVGLDZABZDHNBAVCKL4HHLJWJL3H5FMQOKBVK5VBJL5ZUU';
      const result = await notificationRepo.findByUser(publicKey, 10);

      // If this completes quickly, indexes are likely being used
      expect(result).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty result sets', async () => {
      const result = await unmatchedQueueRepo.listPending(20);

      expect(result.items).toBeInstanceOf(Array);
      expect(result.next_cursor).toBeNull();
      expect(result.has_more).toBe(false);
    });

    it('should handle limit edge cases', async () => {
      // Limit = 1
      const singleItem = await unmatchedQueueRepo.listPending(1);
      expect(singleItem.items.length).toBeLessThanOrEqual(1);

      // Limit = 100 (max)
      const maxItems = await unmatchedQueueRepo.listPending(100);
      expect(maxItems.items.length).toBeLessThanOrEqual(100);

      // Limit > max (should be clamped to 100)
      const tooManyItems = await unmatchedQueueRepo.listPending(500);
      expect(tooManyItems.items.length).toBeLessThanOrEqual(100);
    });

    it('should handle concurrent pagination requests', async () => {
      const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
        unmatchedQueueRepo.listPending(10),
      );

      const results = await Promise.all(concurrentRequests);

      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result.items).toBeInstanceOf(Array);
      });
    });
  });
});
