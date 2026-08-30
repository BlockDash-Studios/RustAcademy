/**
 * Injection token for the search repository. This allows swapping the
 * in-memory implementation for a database-backed one without changing
 * the SearchService or module wiring.
 */
export const SEARCH_REPOSITORY = 'SEARCH_REPOSITORY';
