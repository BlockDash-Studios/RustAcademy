export interface ReviewQueueFilters {
  status?: string;
  maxAgeHours?: number;
  slaBreachedOnly?: boolean;
}

export interface ReviewQueueQuery {
  filters: ReviewQueueFilters;
  page: number;
  pageSize: number;
  sortBy: 'createdAt' | 'slaDeadline';
}

export const MAX_PAGE_SIZE = 100;

/** Builds a bounded, deterministic review-queue query from raw params. */
export function buildReviewQueueQuery(
  filters: ReviewQueueFilters,
  page = 1,
  pageSize = 25,
  sortBy: ReviewQueueQuery['sortBy'] = 'slaDeadline',
): ReviewQueueQuery {
  return {
    filters,
    page: Math.max(1, page),
    pageSize: Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE),
    sortBy,
  };
}
