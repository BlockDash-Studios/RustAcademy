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

/** One indexed appearance of a hashtag in a post (BE-090). */
export interface HashtagOccurrence {
  tag: string;
  postId: string;
  occurredAt: string;
}

/** A hashtag with its time-decayed trend score (BE-090). */
export interface TrendingHashtag {
  tag: string;
  /** Sum of `0.5 ** (ageHours / halfLife)` over every occurrence. */
  score: number;
  /** Raw occurrence count, undecayed, for display alongside the score. */
  postCount: number;
}

/** Weekly challenge lifecycle states (BE-091). */
export type ChallengeState = 'open' | 'voting' | 'closed';

export interface Challenge {
  challengeId: string;
  title: string;
  /** Bonus pot in stroops (1 XLM = 10_000_000 stroops), the indivisible unit. */
  potStroops: bigint;
  state: ChallengeState;
  createdAt: string;
}

export interface ChallengeSubmission {
  challengeId: string;
  submissionId: string;
  userId: string;
  submittedAt: string;
}

/**
 * A payout request produced when a challenge closes (BE-091).
 *
 * This service does not move funds - BE-053 owns payment and drains the queue.
 */
export interface ChallengePayout {
  challengeId: string;
  winningSubmissionIds: string[];
  /** submissionId → stroops awarded. Sums to exactly the pot. */
  awards: Record<string, bigint>;
  /** Vote count the winners tied on; 0 when nobody voted. */
  votes: number;
  queuedAt: string;
}

/** Content kinds a moderation report can target (BE-093). */
export type ModerationTargetKind = 'post' | 'comment';

/** Moderation state of a piece of content (BE-093). */
export type ModerationState = 'visible' | 'hidden' | 'removed';

/** A flag raised against a post or comment (BE-093). */
export interface ContentReport {
  reportId: string;
  targetKind: ModerationTargetKind;
  targetId: string;
  reporterId: string;
  reason: 'spam' | 'abuse' | 'harassment' | 'other';
  details: string;
  status: 'open' | 'resolved';
  createdAt: string;
}

/**
 * One entry in the moderation audit trail (BE-093).
 *
 * The trail is append-only: entries are never edited or deleted, so it can
 * still answer "who hid this, when, and on whose decision" after the report
 * that caused it has been resolved.
 */
export interface ModerationAuditEntry {
  auditId: string;
  targetKind: ModerationTargetKind;
  targetId: string;
  action: 'reported' | 'hidden' | 'restored' | 'removed';
  /** Who caused the entry: the reporter, or the resolver that decided. */
  actorId: string;
  at: string;
  /** Report this entry belongs to, when it came from one. */
  reportId?: string;
  metadata?: Record<string, unknown>;
}

/** What a resolver decided about reported content (BE-093). */
export type ModerationVerdictOutcome = 'restore' | 'remove';

/** A decision on a reported item (BE-093). */
export interface ModerationVerdict {
  reportId: string;
  outcome: ModerationVerdictOutcome;
  /** Governance signer or moderator id that decided. */
  decidedBy: string;
  decidedAt?: string;
}

/**
 * A source that can decide reported content (BE-093).
 *
 * BE-093 ships the hook surface instead of a governance client so the two can
 * be developed independently: the future on-chain `governance` voting module
 * registers a hook and `ContentModerationService.adjudicate` asks each hook in
 * turn until one answers. A hook that abstains returns `undefined`, which
 * leaves the content hidden and the report queued.
 */
export interface ContentVerdictHook {
  /** Stable name, stored on the audit entry the verdict produces. */
  name: string;
  resolve(report: ContentReport): ModerationVerdict | undefined;
}

