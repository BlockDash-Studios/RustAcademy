import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query params for GET /payments/history.
 *
 * Validated by the global `ValidationPipe` (see
 * `src/common/validation.pipe.ts`) like every other DTO, so unknown or
 * malformed query params are rejected with 400 instead of being passed
 * through to the service.
 *
 * NOTE: the service still clamps `limit` to <= 100 and defaults to 20 when
 * absent. Real implementation should clamp at the Horizon boundary
 * instead, but I'm leaving the service-side guard so the stub cannot be
 * abused.
 */
export class TransactionHistoryQueryDto {
  /**
   * Stellar account (G...) whose history to fetch.
   * If omitted, the stub returns the canonical sample ledger for
   * `GACCOUNT-STUB-1`.
   */
  @IsOptional()
  @IsString()
  account?: string;

  /**
   * Page size. Real implementation should clamp to <= 100 implicitly
   * via Horizon's `limit` semantics. The service-side stub clamps to 100.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /**
   * Opaque pagination cursor. Real implementation should pass Horizon's
   * `cursor` paging token; the stub parses as integer index.
   */
  @IsOptional()
  @IsString()
  cursor?: string;
}
