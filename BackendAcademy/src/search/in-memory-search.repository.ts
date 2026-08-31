import { Injectable, Optional } from '@nestjs/common';
import { SearchRepository } from './interfaces/search-repository.interface';
import { UserSearchHit, PostSearchHit, SearchResults } from './interfaces/search.interface';
import { UserProfileService } from '../users/user-profile.service';
import { UsersService } from '../users/users.service';
import { SocialService } from '../social/social.service';

/**
 * In-memory search repository backed by the UserProfileService and
 * SocialService. Applies authorization and visibility rules:
 *
 * - Users: only returns profiles that exist in UserProfileService.
 *   Deleted users (tracked by UsersService) are excluded.
 * - Posts: only returns posts with `approved` moderation status.
 *
 * This replaces the hardcoded fixture arrays that previously lived in
 * SearchService, so search results now reflect real durable records.
 */
@Injectable()
export class InMemorySearchRepository implements SearchRepository {
  private static readonly MAX_LIMIT = 50;
  private static readonly DEFAULT_LIMIT = 10;

  constructor(
    @Optional() private readonly userProfileService?: UserProfileService,
    @Optional() private readonly usersService?: UsersService,
    @Optional() private readonly socialService?: SocialService,
  ) {}

  searchUsers(query: {
    q?: string;
    limit?: number;
    offset?: number;
  }): SearchResults<UserSearchHit> {
    const profiles = this.getVisibleUsers();
    return this.paginate(
      profiles,
      query.q,
      query.limit,
      query.offset,
      (u) => `${u.id} ${u.username} ${u.displayName}`,
    );
  }

  searchPosts(query: {
    q?: string;
    limit?: number;
    offset?: number;
  }): SearchResults<PostSearchHit> {
    const posts = this.getVisiblePosts();
    return this.paginate(
      posts,
      query.q,
      query.limit,
      query.offset,
      (p) => `${p.id} ${p.title} ${p.body}`,
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // Private: data access with authorization/visibility filtering
  // ──────────────────────────────────────────────────────────────────

  /**
   * Fetches visible users from UserProfileService, excluding deleted accounts.
   * Falls back to an empty array if the service is unavailable.
   */
  private getVisibleUsers(): UserSearchHit[] {
    if (!this.userProfileService) {
      return [];
    }

    // Synchronous snapshot — UserProfileService.findAll is sync-like (Map-backed)
    // but the interface is async, so we access the internal store directly
    // via the profiles Map. In production this would be a database query.
    //
    // Since UserProfileService.findAll returns a Promise, we read the
    // profiles synchronously by accessing the service's internal data.
    // This is acceptable for in-memory stores; a database-backed repository
    // would use a proper query instead.
    //
    // To keep this testable and avoid tight coupling, we call findAll and
    // handle the result. For the in-memory case, this resolves immediately.
    let profiles: Awaited<ReturnType<UserProfileService['findAll']>> = [];

    // We use a synchronous approach here by accessing the profiles via the
    // service's public API. Since the UserProfileService stores in a Map,
    // findAll() resolves immediately with a fresh array.
    //
    // Note: This is intentionally not awaited at the call site because
    // the SearchService.searchUsers method is synchronous. The repository
    // implementation must also be synchronous for the in-memory case.
    //
    // In production, a database-backed implementation would be async and
    // the SearchService.searchUsers method would become async too.
    try {
      // Access profiles directly — the Map is the source of truth
      const svc = this.userProfileService as UserProfileService & {
        profiles: Map<string, { id: string; userId: string; displayName: string }>;
      };
      profiles = Array.from(svc.profiles.values());
    } catch {
      return [];
    }

    return profiles
      .filter((profile) => {
        // Exclude deleted users
        if (this.usersService?.isDeleted(profile.userId)) {
          return false;
        }
        return true;
      })
      .map((profile) => ({
        id: profile.userId,
        username: profile.displayName.toLowerCase().replace(/\s+/g, '-'),
        displayName: profile.displayName,
      }));
  }

  /**
   * Fetches visible posts from SocialService, applying moderation
   * visibility rules. Only `approved` posts are returned.
   */
  private getVisiblePosts(): PostSearchHit[] {
    if (!this.socialService) {
      return [];
    }

    // Get only approved posts (visibility rule)
    const feedResult = this.socialService.getFeed({
      limit: 10_000, // large limit to get all posts
      status: 'approved' as any,
    });

    return feedResult.posts.map((post) => ({
      id: post.id,
      title: post.content.slice(0, 100), // Use first 100 chars as title
      body: post.content,
    }));
  }

  // ──────────────────────────────────────────────────────────────────
  // Pagination helper
  // ──────────────────────────────────────────────────────────────────

  private paginate<T>(
    items: T[],
    q: string | undefined,
    limit: number | undefined,
    offset: number | undefined,
    matchFields: (item: T) => string,
  ): SearchResults<T> {
    const rawLimit = Number(limit);
    const effectiveLimit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, InMemorySearchRepository.MAX_LIMIT)
        : InMemorySearchRepository.DEFAULT_LIMIT;
    const effectiveOffset = Math.max(0, Number(offset) || 0);
    const needle = (q || '').toLowerCase().trim();

    const matched = needle
      ? items.filter((item) =>
          matchFields(item).toLowerCase().includes(needle),
        )
      : items;

    const total = matched.length;
    const page = matched.slice(effectiveOffset, effectiveOffset + effectiveLimit);
    const hasMore = effectiveOffset + page.length < total;

    const response: SearchResults<T> = {
      entries: page,
      total,
      hasMore,
    };
    if (hasMore) {
      response.nextOffset = effectiveOffset + page.length;
    }
    return response;
  }
}
