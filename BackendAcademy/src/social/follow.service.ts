import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DEFAULT_RANK_WEIGHT,
  FeedItem,
  FOLLOW_RANK_WEIGHT,
  FollowEdge,
  RankedFeedItem,
} from './social.types';

/**
 * Follow graph for tutors and learners (BE-088).
 *
 * In-memory like `XpService`, so it can be swapped for a repository later
 * without changing callers.
 *
 * The rule that shapes the design is *"unfollow removes future fan-out items but
 * not history"*. That is only expressible if fan-out is recorded when an item is
 * published rather than derived from the follow graph at read time — a read-time
 * join would make already-delivered items vanish the moment the edge is removed.
 * So `fanOut` writes one `FeedItem` per current follower, and `unfollow` only
 * stops subsequent writes.
 */
@Injectable()
export class FollowService {
  /** `followerId` → set of accounts they follow. */
  private readonly following = new Map<string, Set<string>>();
  /** `followeeId` → set of accounts following them. */
  private readonly followers = new Map<string, Set<string>>();
  /** Edge metadata, keyed `followerId|followeeId`. */
  private readonly edges = new Map<string, FollowEdge>();
  /** `viewerId` → items already delivered to that feed. */
  private readonly feeds = new Map<string, FeedItem[]>();

  private static edgeKey(followerId: string, followeeId: string): string {
    return `${followerId}|${followeeId}`;
  }

  follow(followerId: string, followeeId: string): FollowEdge {
    if (followerId === followeeId) {
      throw new BadRequestException('An account cannot follow itself');
    }

    const key = FollowService.edgeKey(followerId, followeeId);
    const existing = this.edges.get(key);
    // Idempotent: re-following must not duplicate the edge or reset followedAt.
    if (existing) return existing;

    const edge: FollowEdge = {
      followerId,
      followeeId,
      followedAt: new Date().toISOString(),
    };
    this.edges.set(key, edge);
    this.addTo(this.following, followerId, followeeId);
    this.addTo(this.followers, followeeId, followerId);
    return edge;
  }

  /**
   * Removes the edge. Deliberately does not touch `feeds`: items already fanned
   * out stay in the follower's history (BE-088).
   */
  unfollow(followerId: string, followeeId: string): boolean {
    const key = FollowService.edgeKey(followerId, followeeId);
    if (!this.edges.delete(key)) return false;

    this.following.get(followerId)?.delete(followeeId);
    this.followers.get(followeeId)?.delete(followerId);
    return true;
  }

  isFollowing(followerId: string, followeeId: string): boolean {
    return this.edges.has(FollowService.edgeKey(followerId, followeeId));
  }

  getFollowing(userId: string): string[] {
    return [...(this.following.get(userId) ?? [])];
  }

  getFollowers(userId: string): string[] {
    return [...(this.followers.get(userId) ?? [])];
  }

  getCounts(userId: string): { followers: number; following: number } {
    return {
      followers: this.followers.get(userId)?.size ?? 0,
      following: this.following.get(userId)?.size ?? 0,
    };
  }

  /**
   * Delivers an item to every account currently following the author.
   *
   * Returns the viewer ids written to, so a caller can assert fan-out breadth.
   */
  fanOut(item: Omit<FeedItem, 'viewerId'>): string[] {
    const recipients = this.getFollowers(item.authorId);

    for (const viewerId of recipients) {
      const feed = this.feeds.get(viewerId) ?? [];
      feed.push({ ...item, viewerId });
      this.feeds.set(viewerId, feed);
    }

    return recipients;
  }

  /**
   * The viewer's feed, newest first, with follow-weighted ranking.
   *
   * `rankWeight` is computed at read time from the *current* graph, so an
   * unfollowed author's historical items remain present but rank lower. They are
   * also flagged `historical` so feed rendering can distinguish them.
   */
  getFeed(viewerId: string): RankedFeedItem[] {
    const items = this.feeds.get(viewerId) ?? [];

    return items
      .map((item) => {
        const followed = this.isFollowing(viewerId, item.authorId);
        return {
          ...item,
          rankWeight: followed ? FOLLOW_RANK_WEIGHT : DEFAULT_RANK_WEIGHT,
          historical: !followed,
        };
      })
      .sort((a, b) => {
        if (b.rankWeight !== a.rankWeight) return b.rankWeight - a.rankWeight;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }

  private addTo(index: Map<string, Set<string>>, key: string, value: string): void {
    const set = index.get(key) ?? new Set<string>();
    set.add(value);
    index.set(key, set);
  }
}
