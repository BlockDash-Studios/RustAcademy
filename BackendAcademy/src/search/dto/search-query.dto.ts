/**
 * Query params for `/search/*` endpoints.
 *
 * Convention: no `class-validator` decorators (matches the rest of the
 * codebase). Service clamps `limit` to <= 50 and defaults to 10 when absent.
 */
export class SearchQueryDto {
  /**
   * Substring search term. Case-insensitive. If omitted, the call returns
   * the unfiltered set (still paginated).
   */
  q?: string;

  /**
   * Page size. Clamped to <= 50 by the service.
   */
  limit?: number;

  /**
   * Pagination offset (zero-based). Defaults to 0.
   */
  offset?: number;
}
