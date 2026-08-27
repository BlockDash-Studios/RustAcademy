import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { HintService } from './hint.service';
import {
  HintDifficultyTier,
  TIER_UNLOCK_THRESHOLDS,
} from './interfaces/hint.interface';

describe('HintService', () => {
  let service: HintService;

  /** Helper: set up a challenge in a course with a user enrolled. */
  function setupAccessibleUser(
    userId = 'learner-1',
    challengeId = 'challenge-1',
    courseId = 'course-1',
  ) {
    service.registerChallenge(challengeId, courseId);
    service.enrollUser(userId, courseId);
  }

  /** Helper: add hints for a challenge at all tiers. */
  function addAllTierHints(challengeId = 'challenge-1') {
    service.addHint({
      challengeId,
      tier: HintDifficultyTier.Nudge,
      content: 'Think about the edge cases.',
      label: 'Gentle nudge',
    });
    service.addHint({
      challengeId,
      tier: HintDifficultyTier.Suggestion,
      content: 'Use a hash map to track seen values.',
      label: 'Directional hint',
    });
    service.addHint({
      challengeId,
      tier: HintDifficultyTier.Solution,
      content: 'Iterate with a Set for O(1) lookups.',
      label: 'Full solution',
    });
  }

  beforeEach(() => {
    service = new HintService();
  });

  // =========================================================================
  // Challenge access enforcement
  // =========================================================================

  describe('challenge access', () => {
    it('throws NotFoundException when the challenge is not registered', () => {
      expect(() =>
        service.getHint('unknown-challenge', 'user-1', { attemptCount: 0 }),
      ).toThrow(NotFoundException);
    });

    it('throws ForbiddenException when the user is not enrolled', () => {
      service.registerChallenge('ch-1', 'course-1');
      // Do NOT enroll the user

      expect(() =>
        service.getHint('ch-1', 'user-1', { attemptCount: 0 }),
      ).toThrow(ForbiddenException);
    });

    it('succeeds when user is enrolled in the owning course', () => {
      setupAccessibleUser();
      addAllTierHints();

      const response = service.getHint('challenge-1', 'learner-1', {
        attemptCount: 0,
      });

      expect(response.hintId).toBeTruthy();
      expect(response.isFallback).toBe(false);
    });

    it('rejects a user enrolled in a different course', () => {
      service.registerChallenge('ch-1', 'course-1');
      service.enrollUser('user-1', 'course-2'); // wrong course

      expect(() =>
        service.getHint('ch-1', 'user-1', { attemptCount: 0 }),
      ).toThrow(ForbiddenException);
    });

    it('allows access when enrolled in the correct course among many', () => {
      service.registerChallenge('challenge-1', 'course-1');
      service.enrollUser('learner-1', 'course-1');
      service.enrollUser('learner-1', 'course-2');
      addAllTierHints();

      const response = service.getHint('challenge-1', 'learner-1', {
        attemptCount: 0,
      });
      expect(response.isFallback).toBe(false);
    });
  });

  // =========================================================================
  // Tier bounds enforcement
  // =========================================================================

  describe('tier bounds', () => {
    beforeEach(() => {
      setupAccessibleUser();
      addAllTierHints();
    });

    it('returns nudge tier when attemptCount=0 and no tier specified', () => {
      const response = service.getHint('challenge-1', 'learner-1', {
        attemptCount: 0,
      });
      expect(response.tier).toBe(HintDifficultyTier.Nudge);
    });

    it('returns suggestion tier when attemptCount=1', () => {
      const response = service.getHint('challenge-1', 'learner-1', {
        attemptCount: 1,
      });
      expect(response.tier).toBe(HintDifficultyTier.Suggestion);
    });

    it('returns solution tier when attemptCount=2', () => {
      const response = service.getHint('challenge-1', 'learner-1', {
        attemptCount: 2,
      });
      expect(response.tier).toBe(HintDifficultyTier.Solution);
    });

    it('caps at suggestion when requesting solution with attemptCount=1', () => {
      const response = service.getHint('challenge-1', 'learner-1', {
        tier: HintDifficultyTier.Solution,
        attemptCount: 1,
      });
      // Cannot get solution; should fall back to suggestion (highest unlocked)
      expect(response.tier).toBe(HintDifficultyTier.Suggestion);
    });

    it('caps at nudge when requesting solution with attemptCount=0', () => {
      const response = service.getHint('challenge-1', 'learner-1', {
        tier: HintDifficultyTier.Solution,
        attemptCount: 0,
      });
      expect(response.tier).toBe(HintDifficultyTier.Nudge);
    });

    it('returns the exact requested tier when it is unlocked', () => {
      const response = service.getHint('challenge-1', 'learner-1', {
        tier: HintDifficultyTier.Suggestion,
        attemptCount: 1,
      });
      expect(response.tier).toBe(HintDifficultyTier.Suggestion);
    });

    it('getUnlockedTier returns nudge for 0 attempts', () => {
      expect(service.getUnlockedTier(0)).toBe(HintDifficultyTier.Nudge);
    });

    it('getUnlockedTier returns suggestion for 1 attempt', () => {
      expect(service.getUnlockedTier(1)).toBe(HintDifficultyTier.Suggestion);
    });

    it('getUnlockedTier returns solution for 2+ attempts', () => {
      expect(service.getUnlockedTier(2)).toBe(HintDifficultyTier.Solution);
      expect(service.getUnlockedTier(10)).toBe(HintDifficultyTier.Solution);
    });
  });

  // =========================================================================
  // Fallback behaviour
  // =========================================================================

  describe('fallback behaviour', () => {
    beforeEach(() => {
      setupAccessibleUser();
    });

    it('returns generic fallback when no hints are registered for the challenge', () => {
      const response = service.getHint('challenge-1', 'learner-1', {
        attemptCount: 0,
      });

      expect(response.isFallback).toBe(true);
      expect(response.hintId).toBe('fallback');
      expect(response.content).toBeTruthy();
      expect(response.tier).toBe(HintDifficultyTier.Nudge);
    });

    it('falls back to nudge when only solution hints exist and attemptCount=0', () => {
      service.addHint({
        challengeId: 'challenge-1',
        tier: HintDifficultyTier.Solution,
        content: 'Use a hash map.',
      });

      const response = service.getHint('challenge-1', 'learner-1', {
        attemptCount: 0,
      });

      // No hints at nudge or suggestion tier → generic fallback
      expect(response.isFallback).toBe(true);
    });

    it('falls back to the highest available tier below requested', () => {
      // Only nudge hint exists, user requests suggestion
      service.addHint({
        challengeId: 'challenge-1',
        tier: HintDifficultyTier.Nudge,
        content: 'Think about edge cases.',
        label: 'Nudge only',
      });

      const response = service.getHint('challenge-1', 'learner-1', {
        tier: HintDifficultyTier.Suggestion,
        attemptCount: 1,
      });

      expect(response.tier).toBe(HintDifficultyTier.Nudge);
      expect(response.label).toBe('Nudge only');
      expect(response.isFallback).toBe(false);
    });

    it('falls back to suggestion when solution is requested but only suggestion exists', () => {
      service.addHint({
        challengeId: 'challenge-1',
        tier: HintDifficultyTier.Suggestion,
        content: 'Use a Set for tracking.',
      });

      const response = service.getHint('challenge-1', 'learner-1', {
        tier: HintDifficultyTier.Solution,
        attemptCount: 2,
      });

      expect(response.tier).toBe(HintDifficultyTier.Suggestion);
      expect(response.isFallback).toBe(false);
    });
  });

  // =========================================================================
  // Anti-spoiler / repeated request enforcement
  // =========================================================================

  describe('anti-spoiler', () => {
    beforeEach(() => {
      setupAccessibleUser();
      addAllTierHints();
      service.setCooldownMs(0);
    });

    it('increments viewCount on each retrieval', () => {
      const first = service.getHint('challenge-1', 'learner-1', {
        attemptCount: 0,
      });
      expect(first.viewCount).toBe(1);

      const second = service.getHint('challenge-1', 'learner-1', {
        attemptCount: 0,
      });
      expect(second.viewCount).toBe(2);
    });

    it('throws when maxViews is exceeded', () => {
      service.setMaxViews(2);

      service.getHint('challenge-1', 'learner-1', { attemptCount: 0 });
      service.getHint('challenge-1', 'learner-1', { attemptCount: 0 });

      expect(() =>
        service.getHint('challenge-1', 'learner-1', { attemptCount: 0 }),
      ).toThrow(BadRequestException);
    });

    it('respects custom maxViews of 1', () => {
      service.setMaxViews(1);

      service.getHint('challenge-1', 'learner-1', { attemptCount: 0 });

      expect(() =>
        service.getHint('challenge-1', 'learner-1', { attemptCount: 0 }),
      ).toThrow(BadRequestException);
    });

    it('allows unlimited views when maxViews=0', () => {
      service.setMaxViews(0);

      for (let i = 0; i < 20; i++) {
        const resp = service.getHint('challenge-1', 'learner-1', {
          attemptCount: 0,
        });
        expect(resp.viewCount).toBe(i + 1);
      }
    });

    it('enforces cooldown between hint requests', () => {
      // Override the cooldown set in beforeEach
      service.setCooldownMs(5000);

      service.getHint('challenge-1', 'learner-1', { attemptCount: 0 });

      expect(() =>
        service.getHint('challenge-1', 'learner-1', { attemptCount: 0 }),
      ).toThrow(BadRequestException);
    });

    it('allows request after cooldown expires', async () => {
      // Override the cooldown set in beforeEach
      service.setCooldownMs(50);

      service.getHint('challenge-1', 'learner-1', { attemptCount: 0 });

      // Wait for cooldown to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      const response = service.getHint('challenge-1', 'learner-1', {
        attemptCount: 0,
      });
      expect(response.viewCount).toBe(2);
    });

    it('returns nextAvailableAt in cooldown error', () => {
      // Override the cooldown set in beforeEach
      service.setCooldownMs(5000);
      service.getHint('challenge-1', 'learner-1', { attemptCount: 0 });

      try {
        service.getHint('challenge-1', 'learner-1', { attemptCount: 0 });
        fail('Expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = (err as BadRequestException).getResponse() as any;
        expect(response.nextAvailableAt).toBeGreaterThan(Date.now());
      }
    });

    it('tracks view count across requests', () => {
      // Cooldown is already 0 from beforeEach
      service.getHint('challenge-1', 'learner-1', { attemptCount: 0 });
      service.getHint('challenge-1', 'learner-1', { attemptCount: 0 });
      service.getHint('challenge-1', 'learner-1', { attemptCount: 0 });

      const hints = service.getHintsForChallenge('challenge-1');
      const record = service.getViewRecord('learner-1', hints[0].id);
      expect(record?.viewCount).toBe(3);
    });

    it('resets view tracking via getViewRecord', () => {
      service.getHint('challenge-1', 'learner-1', { attemptCount: 0 });

      const hints = service.getHintsForChallenge('challenge-1');
      const record = service.getViewRecord('learner-1', hints[0].id);
      expect(record?.viewCount).toBe(1);
    });
  });

  // =========================================================================
  // Configuration validation
  // =========================================================================

  describe('configuration', () => {
    it('rejects negative cooldown', () => {
      expect(() => service.setCooldownMs(-1)).toThrow(BadRequestException);
    });

    it('rejects NaN cooldown', () => {
      expect(() => service.setCooldownMs(NaN)).toThrow(BadRequestException);
    });

    it('rejects negative maxViews', () => {
      expect(() => service.setMaxViews(-1)).toThrow(BadRequestException);
    });

    it('rejects non-integer maxViews', () => {
      expect(() => service.setMaxViews(3.5)).toThrow(BadRequestException);
    });

    it('accepts zero cooldown (no cooldown)', () => {
      expect(() => service.setCooldownMs(0)).not.toThrow();
      expect(service.getCooldownMs()).toBe(0);
    });

    it('accepts zero maxViews (unlimited)', () => {
      expect(() => service.setMaxViews(0)).not.toThrow();
      expect(service.getMaxViews()).toBe(0);
    });
  });

  // =========================================================================
  // Input validation
  // =========================================================================

  describe('input validation', () => {
    it('throws on empty challengeId', () => {
      expect(() =>
        service.getHint('', 'user-1', { attemptCount: 0 }),
      ).toThrow(BadRequestException);
    });

    it('throws on empty userId', () => {
      service.registerChallenge('ch-1', 'course-1');
      expect(() =>
        service.getHint('ch-1', '', { attemptCount: 0 }),
      ).toThrow(BadRequestException);
    });

    it('throws on whitespace-only challengeId', () => {
      expect(() =>
        service.getHint('   ', 'user-1', { attemptCount: 0 }),
      ).toThrow(BadRequestException);
    });

    it('throws on empty courseId in registerChallenge', () => {
      expect(() => service.registerChallenge('ch-1', '')).toThrow(
        BadRequestException,
      );
    });

    it('throws on empty courseId in enrollUser', () => {
      expect(() => service.enrollUser('user-1', '')).toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // Enrollment and challenge registration
  // =========================================================================

  describe('enrollment and registration', () => {
    it('registerChallenge stores challenge-course mapping', () => {
      service.registerChallenge('ch-1', 'course-1');
      expect(service.getCourseForChallenge('ch-1')).toBe('course-1');
    });

    it('getCourseForChallenge returns null for unknown challenge', () => {
      expect(service.getCourseForChallenge('unknown')).toBeNull();
    });

    it('enrollUser grants access', () => {
      service.enrollUser('user-1', 'course-1');
      expect(service.isEnrolled('user-1', 'course-1')).toBe(true);
    });

    it('isEnrolled returns false for non-enrolled user', () => {
      expect(service.isEnrolled('user-1', 'course-1')).toBe(false);
    });

    it('multiple enrollments are tracked independently', () => {
      service.enrollUser('user-1', 'course-1');
      service.enrollUser('user-1', 'course-2');

      expect(service.isEnrolled('user-1', 'course-1')).toBe(true);
      expect(service.isEnrolled('user-1', 'course-2')).toBe(true);
      expect(service.isEnrolled('user-2', 'course-1')).toBe(false);
    });
  });

  // =========================================================================
  // Hint definition management
  // =========================================================================

  describe('hint definitions', () => {
    it('addHint stores and returns the hint with generated id', () => {
      const hint = service.addHint({
        challengeId: 'ch-1',
        tier: HintDifficultyTier.Nudge,
        content: 'Test hint',
      });

      expect(hint.id).toBeTruthy();
      expect(hint.challengeId).toBe('ch-1');
      expect(hint.tier).toBe(HintDifficultyTier.Nudge);
    });

    it('addHint preserves provided id', () => {
      const hint = service.addHint({
        id: 'custom-id',
        challengeId: 'ch-1',
        tier: HintDifficultyTier.Nudge,
        content: 'Test hint',
      });

      expect(hint.id).toBe('custom-id');
    });

    it('getHintsForChallenge returns all hints for a challenge', () => {
      addAllTierHints('ch-1');
      const hints = service.getHintsForChallenge('ch-1');
      expect(hints).toHaveLength(3);
    });

    it('getHintsForChallenge returns empty array for unknown challenge', () => {
      expect(service.getHintsForChallenge('unknown')).toEqual([]);
    });
  });

  // =========================================================================
  // Reset behaviour
  // =========================================================================

  describe('resetAll', () => {
    it('clears all state', () => {
      setupAccessibleUser();
      addAllTierHints();
      service.getHint('challenge-1', 'learner-1', { attemptCount: 0 });

      service.resetAll();

      expect(service.getCourseForChallenge('challenge-1')).toBeNull();
      expect(service.isEnrolled('learner-1', 'course-1')).toBe(false);
      expect(service.getHintsForChallenge('challenge-1')).toEqual([]);
    });
  });

  // =========================================================================
  // Integration: full flow scenario
  // =========================================================================

  describe('full flow scenario', () => {
    it('learner progresses through tiers as they attempt the challenge', () => {
      setupAccessibleUser('alice', 'rust-101', 'rust-course');
      addAllTierHints('rust-101');
      service.setCooldownMs(0);

      // 0 attempts → nudge
      const r1 = service.getHint('rust-101', 'alice', { attemptCount: 0 });
      expect(r1.tier).toBe(HintDifficultyTier.Nudge);
      expect(r1.isFallback).toBe(false);

      // 1 attempt → suggestion
      const r2 = service.getHint('rust-101', 'alice', { attemptCount: 1 });
      expect(r2.tier).toBe(HintDifficultyTier.Suggestion);

      // 2 attempts → solution
      const r3 = service.getHint('rust-101', 'alice', { attemptCount: 2 });
      expect(r3.tier).toBe(HintDifficultyTier.Solution);

      // View counts are tracked per hint
      expect(r1.viewCount).toBe(1);
      expect(r2.viewCount).toBe(1);
      expect(r3.viewCount).toBe(1);
    });

    it('different users have isolated view tracking', () => {
      setupAccessibleUser('alice', 'ch-1', 'course-1');
      setupAccessibleUser('bob', 'ch-1', 'course-1');
      addAllTierHints('ch-1');
      service.setCooldownMs(0);

      service.getHint('ch-1', 'alice', { attemptCount: 0 });
      service.getHint('ch-1', 'alice', { attemptCount: 0 });
      service.getHint('ch-1', 'bob', { attemptCount: 0 });

      // Alice has viewed the nudge hint 2 times, Bob 1 time
      const hints = service.getHintsForChallenge('ch-1');
      const nudgeHintId = hints.find(
        (h) => h.tier === HintDifficultyTier.Nudge,
      )!.id;

      expect(service.getViewRecord('alice', nudgeHintId)?.viewCount).toBe(2);
      expect(service.getViewRecord('bob', nudgeHintId)?.viewCount).toBe(1);
    });
  });
});
