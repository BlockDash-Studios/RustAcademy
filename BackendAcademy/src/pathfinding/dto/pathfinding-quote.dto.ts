/**
 * Body for POST /pathfinding/quote.
 *
 * NOTE: no `class-validator` decorators (matches the codebase convention).
 * Real implementation should clamp `sourceAmount` to a positive decimal
 * and require either native XLM (`assetIssuer == null`) or a known issuer.
 */
export class PathfindingQuoteDto {
  sourceAssetCode: string;
  /** `null` when source is native XLM. */
  sourceAssetIssuer: string | null;
  destinationAssetCode: string;
  /** `null` when destination is native XLM. */
  destinationAssetIssuer: string | null;
  /** Source amount as a stringified decimal to preserve Stellar precision. */
  sourceAmount: string;
}
