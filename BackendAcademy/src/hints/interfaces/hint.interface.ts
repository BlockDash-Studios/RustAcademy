/**
 * Difficulty tiers for hints, ordered from least to most revealing.
 *
 * Tier unlocking is gated by attempt count:
 *   - nudge:       0+ attempts (always available)
 *   - suggestion:  1+ attempts
 *   - solution:    2+ attempts
 */
export enum HintDifficultyTier {
  Nudge = 'nudge',
  Suggestion = 'suggestion',
  Solution = 'solution',
}

/** Ordered ranking – lower index = less revealing. */
export const TIER_ORDER: HintDifficultyTier[] = [
  HintDifficultyTier.Nudge,
  HintDifficultyTier.Suggestion,
  HintDifficultyTier.Solution,
];

/**
 * A static hint definition stored in the registry.
 */
export interface HintDefinition {
  id: string;
  challengeId: string;
  tier: HintDifficultyTier;
  content: string;
  /** Optional label shown alongside the tier for clarity (e.g. "Gentle nudge"). */
  label?: string;
}

/**
 * The response payload returned to the learner.
 */
export interface HintResponse {
  hintId: string;
  challengeId: string;
  tier: HintDifficultyTier;
  content: string;
  label?: string;
  /** Number of times this user has viewed this specific hint. */
  viewCount: number;
  /** Maximum views allowed per user per hint. 0 = no cap. */
  maxViews: number;
  /** Unix-ms timestamp of the next moment the user may request a new hint. 0 = no cooldown. */
  nextAvailableAt: number;
  /** Whether this response is a generic fallback (no tier-specific hint existed). */
  isFallback: boolean;
}

/**
 * Record of how many times a user has viewed a specific hint and when.
 */
export interface HintViewRecord {
  viewCount: number;
  lastViewedAt: number;
}

/**
 * Tier unlocking thresholds keyed by tier.
 * Value = minimum number of attempts required to unlock that tier.
 */
export const TIER_UNLOCK_THRESHOLDS: Record<HintDifficultyTier, number> = {
  [HintDifficultyTier.Nudge]: 0,
  [HintDifficultyTier.Suggestion]: 1,
  [HintDifficultyTier.Solution]: 2,
};
