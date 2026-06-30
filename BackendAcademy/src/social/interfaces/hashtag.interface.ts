/**
 * A single hashtag with its metadata.
 */
export interface Hashtag {
  /** The tag name without the leading '#'. e.g. "rust" */
  tag: string;

  /** Total number of posts containing this hashtag. */
  postCount: number;

  /** When this hashtag was first seen in the platform. */
  firstSeenAt: Date;

  /** When this hashtag was most recently used. */
  lastUsedAt: Date;
}

/**
 * Paginated response for hashtag listing / search endpoints.
 */
export interface HashtagListResponse {
  hashtags: Hashtag[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Query parameters shared across hashtag discovery endpoints.
 */
export interface HashtagQueryParams {
  /** Partial or full hashtag to search for (without '#'). */
  query?: string;

  /** Page number (1-based). */
  page?: number;

  /** Max results per page. */
  limit?: number;
}
