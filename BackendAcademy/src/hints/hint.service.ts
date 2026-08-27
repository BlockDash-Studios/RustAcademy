import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HintDefinition,
  HintDifficultyTier,
  HintResponse,
  HintViewRecord,
  TIER_ORDER,
  TIER_UNLOCK_THRESHOLDS,
} from './interfaces/hint.interface';

/** Default cooldown between repeated views of the same hint (ms). */
const DEFAULT_HINT_COOLDOWN_MS = 60_000;

/** Default maximum views per hint per user. 0 = unlimited. */
const DEFAULT_MAX_VIEWS = 5;

/** Generic fallback content when no tier-specific hint exists. */
const FALLBACK_HINT_CONTENT =
  'Take a step back and re-read the problem statement carefully. ' +
  'Break it into smaller parts and tackle each one independently.';

@Injectable()
export class HintService {
  // ── Internal registries ────────────────────────────────────────────

  /**
   * Challenge access registry: `challengeId -> courseId`.
   * A learner must be enrolled in the course that owns a challenge
   * before hints for that challenge are accessible.
   */
  private readonly challengeRegistry = new Map<string, string>();

  /**
   * Hint definitions keyed by challengeId, ordered by tier then insertion.
   */
  private readonly hintDefinitions = new Map<string, HintDefinition[]>();

  /**
   * User-course enrollments: `userId -> Set<courseId>`.
   */
  private readonly enrollments = new Map<string, Set<string>>();

  /**
   * Per-user per-hint view tracking: `userId:hintId -> HintViewRecord`.
   */
  private readonly viewRecords = new Map<string, HintViewRecord>();

  /**
   * Per-user per-challenge hint cooldown timestamps (ms since epoch).
   * Keyed by `userId:challengeId`, value = earliest timestamp at which
   * the user may request the next hint.
   */
  private readonly cooldowns = new Map<string, number>();

  /** Configurable cooldown duration (ms). */
  private cooldownMs = DEFAULT_HINT_COOLDOWN_MS;

  /** Configurable max views per hint per user. */
  private maxViews = DEFAULT_MAX_VIEWS;

  // ── Challenge registration ─────────────────────────────────────────

  /**
   * Register a challenge as belonging to a course.
   */
  registerChallenge(challengeId: string, courseId: string): void {
    this.normalizeId(challengeId, 'challengeId');
    this.normalizeId(courseId, 'courseId');
    this.challengeRegistry.set(challengeId, courseId);
  }

  /**
   * Returns the courseId that owns a challenge, or null if unregistered.
   */
  getCourseForChallenge(challengeId: string): string | null {
    return this.challengeRegistry.get(challengeId) ?? null;
  }

  // ── Enrollment management ──────────────────────────────────────────

  /**
   * Enroll a user in a course, granting them access to all challenges
   * that belong to that course.
   */
  enrollUser(userId: string, courseId: string): void {
    const normalizedUserId = this.normalizeId(userId, 'userId');
    const normalizedCourseId = this.normalizeId(courseId, 'courseId');

    let courseSet = this.enrollments.get(normalizedUserId);
    if (!courseSet) {
      courseSet = new Set();
      this.enrollments.set(normalizedUserId, courseSet);
    }
    courseSet.add(normalizedCourseId);
  }

  /**
   * Check whether a user is enrolled in a specific course.
   */
  isEnrolled(userId: string, courseId: string): boolean {
    return this.enrollments.get(userId)?.has(courseId) ?? false;
  }

  // ── Hint definition management ─────────────────────────────────────

  /**
   * Add a hint definition to the registry.
   */
  addHint(hint: Omit<HintDefinition, 'id'> & { id?: string }): HintDefinition {
    const normalizedChallengeId = this.normalizeId(hint.challengeId, 'challengeId');
    const fullHint: HintDefinition = {
      id: hint.id ?? crypto.randomUUID(),
      challengeId: normalizedChallengeId,
      tier: hint.tier,
      content: hint.content,
      label: hint.label,
    };

    let list = this.hintDefinitions.get(normalizedChallengeId);
    if (!list) {
      list = [];
      this.hintDefinitions.set(normalizedChallengeId, list);
    }
    list.push(fullHint);
    return fullHint;
  }

  /**
   * Get all hint definitions for a challenge.
   */
  getHintsForChallenge(challengeId: string): HintDefinition[] {
    return this.hintDefinitions.get(challengeId) ?? [];
  }

  // ── Configuration ──────────────────────────────────────────────────

  setCooldownMs(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new BadRequestException({
        error: 'INVALID_COOLDOWN',
        message: 'cooldownMs must be a non-negative number',
      });
    }
    this.cooldownMs = ms;
  }

  getCooldownMs(): number {
    return this.cooldownMs;
  }

  setMaxViews(max: number): void {
    if (!Number.isInteger(max) || max < 0) {
      throw new BadRequestException({
        error: 'INVALID_MAX_VIEWS',
        message: 'maxViews must be a non-negative integer',
      });
    }
    this.maxViews = max;
  }

  getMaxViews(): number {
    return this.maxViews;
  }

  // ── Core hint retrieval (enforcement point) ────────────────────────

  /**
   * Retrieve a hint for a user on a specific challenge.
   *
   * Enforcement checks (in order):
   *  1. Challenge must be registered.
   *  2. User must be enrolled in the owning course.
   *  3. Requested tier (or best available) must be unlocked by attempt count.
   *  4. Cooldown must have elapsed since the last hint for this challenge.
   *  5. View limit must not have been exceeded for the selected hint.
   *
   * Fallback behaviour:
   *  - If no hint exists at the exact requested tier, the highest available
   *    tier at or below the requested tier is returned.
   *  - If no hints exist at all for the challenge, a generic fallback
   *    hint is returned with `isFallback: true`.
   */
  getHint(
    challengeId: string,
    userId: string,
    options: {
      tier?: HintDifficultyTier;
      /** Current attempt count for this user+challenge. */
      attemptCount: number;
    },
  ): HintResponse {
    const normalizedChallengeId = this.normalizeId(challengeId, 'challengeId');
    const normalizedUserId = this.normalizeId(userId, 'userId');

    // ── 1. Challenge must exist ──
    const courseId = this.challengeRegistry.get(normalizedChallengeId);
    if (!courseId) {
      throw new NotFoundException({
        error: 'HINT_CHALLENGE_NOT_FOUND',
        message: `Challenge "${normalizedChallengeId}" is not registered`,
      });
    }

    // ── 2. User must be enrolled ──
    if (!this.isEnrolled(normalizedUserId, courseId)) {
      throw new ForbiddenException({
        error: 'HINT_CHALLENGE_INACCESSIBLE',
        message:
          `User "${normalizedUserId}" is not enrolled in course "${courseId}" ` +
          `that owns challenge "${normalizedChallengeId}"`,
      });
    }

    // ── 3. Determine the unlocked tier ceiling ──
    const unlockedTier = this.getUnlockedTier(options.attemptCount);

    // ── 4. Cooldown check ──
    const cooldownKey = `${normalizedUserId}:${normalizedChallengeId}`;
    const now = Date.now();
    const cooldownUntil = this.cooldowns.get(cooldownKey) ?? 0;
    if (now < cooldownUntil) {
      throw new BadRequestException({
        error: 'HINT_COOLDOWN_ACTIVE',
        message: 'Please wait before requesting another hint',
        nextAvailableAt: cooldownUntil,
      });
    }

    // ── 5. Select best available hint ──
    const allHints = this.hintDefinitions.get(normalizedChallengeId) ?? [];
    const requestedTier = options.tier ?? unlockedTier;

    const selectedHint = this.selectHint(allHints, requestedTier, unlockedTier);

    // ── 6. Fallback: no hints at all ──
    if (!selectedHint) {
      // Set cooldown so the user can't spam fallback requests
      this.cooldowns.set(cooldownKey, now + this.cooldownMs);
      return {
        hintId: 'fallback',
        challengeId: normalizedChallengeId,
        tier: HintDifficultyTier.Nudge,
        content: FALLBACK_HINT_CONTENT,
        label: 'General guidance',
        viewCount: 0,
        maxViews: 0,
        nextAvailableAt: now + this.cooldownMs,
        isFallback: true,
      };
    }

    // ── 7. View tracking / anti-spoiler ──
    const viewKey = `${normalizedUserId}:${selectedHint.id}`;
    const record = this.viewRecords.get(viewKey) ?? { viewCount: 0, lastViewedAt: 0 };

    if (this.maxViews > 0 && record.viewCount >= this.maxViews) {
      throw new BadRequestException({
        error: 'HINT_MAX_VIEWS_EXCEEDED',
        message: `You have reached the maximum views (${this.maxViews}) for this hint`,
        hintId: selectedHint.id,
        viewCount: record.viewCount,
      });
    }

    // Record the view
    record.viewCount += 1;
    record.lastViewedAt = now;
    this.viewRecords.set(viewKey, record);

    // Set cooldown
    this.cooldowns.set(cooldownKey, now + this.cooldownMs);

    return {
      hintId: selectedHint.id,
      challengeId: normalizedChallengeId,
      tier: selectedHint.tier,
      content: selectedHint.content,
      label: selectedHint.label,
      viewCount: record.viewCount,
      maxViews: this.maxViews,
      nextAvailableAt: now + this.cooldownMs,
      isFallback: false,
    };
  }

  // ── Read-only query helpers ────────────────────────────────────────

  /**
   * Get the view record for a specific user+hint pair.
   */
  getViewRecord(userId: string, hintId: string): HintViewRecord | undefined {
    return this.viewRecords.get(`${userId}:${hintId}`);
  }

  /**
   * Get the highest tier a user may access given their attempt count.
   */
  getUnlockedTier(attemptCount: number): HintDifficultyTier {
    let unlocked = HintDifficultyTier.Nudge;
    for (const tier of TIER_ORDER) {
      if (attemptCount >= TIER_UNLOCK_THRESHOLDS[tier]) {
        unlocked = tier;
      }
    }
    return unlocked;
  }

  /**
   * Reset all state (useful in tests).
   */
  resetAll(): void {
    this.challengeRegistry.clear();
    this.hintDefinitions.clear();
    this.enrollments.clear();
    this.viewRecords.clear();
    this.cooldowns.clear();
  }

  // ── Internal helpers ───────────────────────────────────────────────

  /**
   * Select the best hint given a requested tier and the user's unlocked ceiling.
   *
   * Returns the highest-tier hint that is:
   *  1. At or below the requested tier, AND
   *  2. At or below the unlocked tier.
   *
   * Returns null if no hints match (caller should use fallback).
   */
  private selectHint(
    hints: HintDefinition[],
    requestedTier: HintDifficultyTier,
    unlockedTier: HintDifficultyTier,
  ): HintDefinition | null {
    const effectiveMax = this.minTier(requestedTier, unlockedTier);

    // Filter to hints at or below the effective ceiling, pick highest tier
    const candidates = hints
      .filter((h) => this.tierRank(h.tier) <= this.tierRank(effectiveMax))
      .sort((a, b) => this.tierRank(b.tier) - this.tierRank(a.tier));

    return candidates[0] ?? null;
  }

  /**
   * Return the "lower" of two tiers (the one with the smaller rank).
   */
  private minTier(a: HintDifficultyTier, b: HintDifficultyTier): HintDifficultyTier {
    return this.tierRank(a) <= this.tierRank(b) ? a : b;
  }

  /**
   * Numeric rank of a tier (lower = less revealing).
   */
  private tierRank(tier: HintDifficultyTier): number {
    return TIER_ORDER.indexOf(tier);
  }

  /**
   * Normalize and validate a string ID.
   */
  private normalizeId(value: string | undefined, field: string): string {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException({
        error: 'INVALID_HINT_INPUT',
        message: `${field} is required`,
      });
    }
    return normalized;
  }
}
