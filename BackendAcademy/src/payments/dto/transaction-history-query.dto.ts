/**
 * Query params for GET /payments/history.
 *
 * Mirrors the conventions of other DTOs in this codebase: no
 * `class-validator` decorators are used; bound values are enforced
 * implicitly by query parsing and the controller/service code paths.
 *
 * NOTE: the service clamps `limit` to <= 100 and defaults to 20 when
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
  account?: string;

  /**
   * Page size. Real implementation should clamp to <= 100 implicitly
   * via Horizon's `limit` semantics. The service-side stub clamps to 100.
   */
  limit?: number;

  /**
   * Opaque pagination cursor. Real implementation should pass Horizon's
   * `cursor` paging token; the stub parses as integer index.
   */
  cursor?: string;
}
