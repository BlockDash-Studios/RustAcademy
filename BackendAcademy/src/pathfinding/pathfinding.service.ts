import { Injectable } from '@nestjs/common';
import { PathfindingQuoteDto } from './dto/pathfinding-quote.dto';
import { PathHop, PathQuote } from './interfaces/pathfinding.interface';

interface CacheEntry {
  quote: PathQuote;
  expiresAt: number;
}

@Injectable()
export class PathfindingService {
  private static readonly STUB_FEE_RATE = 0.005;
  private static readonly STUB_SETTLE_SECONDS = 5;
  private static readonly MAX_HOPS = 5;
  private static readonly CACHE_TTL_MS = 60_000;
  private static readonly MAX_SOURCE_AMOUNT = 1_000_000_000;

  private cache = new Map<string, CacheEntry>();

  private getCacheKey(dto: PathfindingQuoteDto): string {
    return `${dto.sourceAssetCode}:${dto.sourceAssetIssuer || 'native'}:${dto.destinationAssetCode}:${dto.destinationAssetIssuer || 'native'}:${dto.sourceAmount}`;
  }

  private pruneCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
    if (this.cache.size > 1000) {
      const entries = [...this.cache.entries()]
        .sort(([, a], [, b]) => a.expiresAt - b.expiresAt);
      const toDelete = entries.slice(0, this.cache.size - 1000);
      for (const [key] of toDelete) {
        this.cache.delete(key);
      }
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  quotePathPayment(dto: PathfindingQuoteDto): PathQuote {
    const sourceNum = Number(dto.sourceAmount);

    if (!Number.isFinite(sourceNum) || sourceNum <= 0) {
      return {
        sourceAmount: dto.sourceAmount,
        destinationAmount: '0.0000000',
        hops: [],
        estimatedSettleSeconds: 0,
      };
    }

    if (sourceNum > PathfindingService.MAX_SOURCE_AMOUNT) {
      return {
        sourceAmount: dto.sourceAmount,
        destinationAmount: '0.0000000',
        hops: [],
        estimatedSettleSeconds: 0,
        error: `Source amount exceeds maximum of ${PathfindingService.MAX_SOURCE_AMOUNT}`,
      };
    }

    const cacheKey = this.getCacheKey(dto);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.quote;
    }

    this.pruneCache();

    const destNum = sourceNum * (1 - PathfindingService.STUB_FEE_RATE);
    const singleHop: PathHop = {
      assetCode: dto.destinationAssetCode,
      assetIssuer: dto.destinationAssetIssuer,
      amount: destNum.toFixed(7),
    };

    const quote: PathQuote = {
      sourceAmount: dto.sourceAmount,
      destinationAmount: destNum.toFixed(7),
      hops: [singleHop],
      estimatedSettleSeconds: PathfindingService.STUB_SETTLE_SECONDS,
    };

    this.cache.set(cacheKey, {
      quote,
      expiresAt: Date.now() + PathfindingService.CACHE_TTL_MS,
    });

    return quote;
  }
}