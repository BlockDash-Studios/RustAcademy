/** Weight applied to a feed item authored by someone the viewer follows (BE-088). */
export const FOLLOW_RANK_WEIGHT = 2;

/** Weight applied to a feed item from an account the viewer does not follow. */
export const DEFAULT_RANK_WEIGHT = 1;

export interface FollowEdge {
  followerId: string;
  followeeId: string;
  followedAt: string;
}

/**
 * An item already fanned out to a follower's feed.
 *
 * Fan-out is recorded at publish time rather than computed per read, which is
 * what makes the BE-088 history rule expressible: unfollowing stops *future*
 * fan-out but leaves items that were already delivered in place.
 */
export interface FeedItem {
  itemId: string;
  /** Feed this item was delivered to. */
  viewerId: string;
  authorId: string;
  /** Present for showcase posts (BE-089); absent for plain posts. */
  kind: 'post' | 'showcase';
  createdAt: string;
}

export interface RankedFeedItem extends FeedItem {
  /** `FOLLOW_RANK_WEIGHT` when the viewer currently follows the author. */
  rankWeight: number;
  /** True when the author is no longer followed but the item predates unfollow. */
  historical: boolean;
}

/**
 * A project showcase post (BE-089).
 *
 * Carries the three external references a showcase is defined by, and is stored
 * with `kind: 'showcase'` so feed rendering can flag it.
 */
export interface ShowcasePost {
  itemId: string;
  authorId: string;
  kind: 'showcase';
  title: string;
  /** Absolute https URL of the source repository. */
  repoUrl: string;
  /** Absolute https URL of the live demo. */
  demoUrl: string;
  /** Soroban contract id (`C…` strkey), checksum-validated on create. */
  contractId: string;
  createdAt: string;
}
