import { UserSearchHit, PostSearchHit } from './search.interface';

/**
 * Repository interface for search data access.
 *
 * Replaces the hardcoded fixture arrays in SearchService with a proper
 * data-access layer. Implementations pull from durable stores
 * (UserProfileService, SocialService) and apply authorization and
 * visibility rules before returning results.
 */
export interface SearchUserRepository {
  /**
   * Search users by substring match across id, username, and displayName.
   * Returns only visible, non-deleted users.
   */
  searchUsers(query: {
    q?: string;
    limit?: number;
    offset?: number;
  }): {
    entries: UserSearchHit[];
    total: number;
    hasMore: boolean;
    nextOffset?: number;
  };
}

export interface SearchPostRepository {
  /**
   * Search posts by substring match across id, title, and body.
   * Returns only approved (visible) posts that pass authorization rules.
   */
  searchPosts(query: {
    q?: string;
    limit?: number;
    offset?: number;
  }): {
    entries: PostSearchHit[];
    total: number;
    hasMore: boolean;
    nextOffset?: number;
  };
}

/**
 * Combined search repository for all entity types.
 */
export type SearchRepository = SearchUserRepository & SearchPostRepository;
