export interface UserSearchHit {
  id: string;
  username: string;
  displayName: string;
}

export interface CourseSearchHit {
  id: string;
  title: string;
  description: string;
}

export interface PostSearchHit {
  id: string;
  title: string;
  body: string;
}

export interface SearchResults<T> {
  entries: T[];
  /** Total matching entries (not just the current page). */
  total: number;
  hasMore: boolean;
  /**
   * Zero-based skip-cursor for the next page. Callers should pass this back
   * as the `offset` query param on the next request. Absent when no more
   * pages remain.
   */
  nextOffset?: number;
}
