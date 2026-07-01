import { Injectable } from '@nestjs/common';
import { PathfindingQuoteDto } from './dto/pathfinding-quote.dto';
import { PathHop, PathQuote } from './interfaces/pathfinding.interface';

@Injectable()
export class PathfindingService {
  /**
   * Default simulated spread applied to the deterministic stub quote.
   * Real implementation will rely on Horizon's spread-minus-fee semantics.
   */
  private static readonly STUB_FEE_RATE = 0.005;
  /** Default settle estimate for the stub quote. */
  private static readonly STUB_SETTLE_SECONDS = 5;

  /**
   * Returns a deterministic stub quote derived from the requested pair.
   *
   * Real implementation must replace this with the Horizon path-finding
   * endpoint:
   *
   *   new StellarSdk.Horizon.Server(HORIZON_URL)
   *     .strictSendPaths(sourceAsset, sourceAmount, [destinationAsset])
   *     .call()
   *
   * TODO: replace with Horizon-backed repository once
   * `@stellar/stellar-sdk` is added to BackendAcademy dependencies.
   *
   * Determinism note: `destinationAmount = sourceAmount * (1 - STUB_FEE_RATE)`.
   * Multi-hop routing beyond a single hop is NOT stubbed; this method
   * always returns a single-hop quote regardless of asset-pair complexity.
   *
   * Bad-input handling: a non-finite or non-positive `sourceAmount`
   * returns a zero-amount quote rather than throwing, so callers (UI,
   * mock tests) consistently see PathQuote-shaped responses. Real impl
   * will throw BadRequestException once class-validator decorators are
   * wired in (this project currently has no global ValidationPipe).
   */
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

    const destNum = sourceNum * (1 - PathfindingService.STUB_FEE_RATE);
    const singleHop: PathHop = {
      assetCode: dto.destinationAssetCode,
      assetIssuer: dto.destinationAssetIssuer,
      amount: destNum.toFixed(7),
    };

    return {
      sourceAmount: dto.sourceAmount,
      destinationAmount: destNum.toFixed(7),
      hops: [singleHop],
      estimatedSettleSeconds: PathfindingService.STUB_SETTLE_SECONDS,
    };
  }
}
