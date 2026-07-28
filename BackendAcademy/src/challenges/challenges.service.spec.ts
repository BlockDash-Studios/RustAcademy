import { BadRequestException } from '@nestjs/common';
import { ChallengesService } from './challenges.service';

describe('ChallengesService', () => {
  let service: ChallengesService;

  beforeEach(() => {
    service = new ChallengesService();
  });

  // ---------------------------------------------------------------------------
  // Vote tracking (existing)
  // ---------------------------------------------------------------------------

  describe('vote tracking', () => {
    it('records an upvote and returns the tally', () => {
      const result = service.castVote('weekly-rust-1', {
        userId: 'learner-1',
        value: 'up',
      });

      expect(result).toEqual({
        challengeId: 'weekly-rust-1',
        downvotes: 0,
        score: 1,
        totalVotes: 1,
        upvotes: 1,
        userId: 'learner-1',
        userVote: 'up',
      });
    });

    it('updates a repeated user vote instead of double counting', () => {
      service.castVote('weekly-rust-1', { userId: 'learner-1', value: 'up' });
      service.castVote('weekly-rust-1', { userId: 'learner-1', value: 'down' });
      service.castVote('weekly-rust-1', { userId: 'learner-2', value: 'up' });

      expect(service.getTally('weekly-rust-1')).toEqual({
        challengeId: 'weekly-rust-1',
        downvotes: 1,
        score: 0,
        totalVotes: 2,
        upvotes: 1,
      });
    });

    it('keeps challenge tallies isolated', () => {
      service.castVote('challenge-a', { userId: 'learner-1', value: 'up' });
      service.castVote('challenge-b', { userId: 'learner-1', value: 'down' });

      expect(service.getTally('challenge-a').score).toBe(1);
      expect(service.getTally('challenge-b').score).toBe(-1);
    });

    it('rejects invalid vote values', () => {
      expect(() =>
        service.castVote('challenge-a', {
          userId: 'learner-1',
          value: 'maybe' as 'up',
        }),
      ).toThrow(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------------
  // Attempt limit tracking (new)
  // ---------------------------------------------------------------------------

  describe('attempt limit tracking', () => {
    it('returns allowed=true and correct default remaining for first attempt', () => {
      const info = service.getAttemptInfo('weekly-rust-2', 'learner-42');

      expect(info).toEqual({
        challengeId: 'weekly-rust-2',
        userId: 'learner-42',
        current: 0,
        max: 3,
        remaining: 3,
        allowed: true,
      });
    });

    it('returns remaining=0 after exhausting all attempts', () => {
      service.recordAttempt('challenge-x', 'user-1');
      service.recordAttempt('challenge-x', 'user-1');
      service.recordAttempt('challenge-x', 'user-1');

      const info = service.getAttemptInfo('challenge-x', 'user-1');

      expect(info.current).toBe(3);
      expect(info.remaining).toBe(0);
      expect(info.allowed).toBe(false);
    });

    it('throws BadRequestException when attempt limit is exceeded', () => {
      service.recordAttempt('challenge-x', 'user-1');
      service.recordAttempt('challenge-x', 'user-1');
      service.recordAttempt('challenge-x', 'user-1');

      expect(() => service.recordAttempt('challenge-x', 'user-1')).toThrow(
        BadRequestException,
      );
    });

    it('uses a custom max when configured via setMaxAttempts', () => {
      service.setMaxAttempts('hard-challenge', 1);

      service.recordAttempt('hard-challenge', 'user-1');
      expect(() => service.recordAttempt('hard-challenge', 'user-1')).toThrow(
        BadRequestException,
      );
    });

    it('keeps attempt counters isolated per user', () => {
      service.recordAttempt('challenge-y', 'alice');
      service.recordAttempt('challenge-y', 'alice');
      service.recordAttempt('challenge-y', 'bob');

      const alice = service.getAttemptInfo('challenge-y', 'alice');
      const bob = service.getAttemptInfo('challenge-y', 'bob');

      expect(alice.current).toBe(2);
      expect(bob.current).toBe(1);
    });

    it('keeps attempt counters isolated per challenge', () => {
      service.recordAttempt('challenge-a', 'user-1');
      service.recordAttempt('challenge-b', 'user-1');

      expect(service.getAttemptInfo('challenge-a', 'user-1').current).toBe(1);
      expect(service.getAttemptInfo('challenge-b', 'user-1').current).toBe(1);
    });

    it('rejects setMaxAttempts with a non-positive value', () => {
      expect(() => service.setMaxAttempts('ch', 0)).toThrow(BadRequestException);
      expect(() => service.setMaxAttempts('ch', -1)).toThrow(BadRequestException);
      expect(() => service.setMaxAttempts('ch', 3.5)).toThrow(BadRequestException);
    });

    it('resets all attempt counters via resetAttempts', () => {
      service.recordAttempt('challenge-a', 'u1');
      service.recordAttempt('challenge-a', 'u1');
      service.resetAttempts();

      expect(service.getAttemptInfo('challenge-a', 'u1').current).toBe(0);
    });

    it('resets attempt counters for a single challenge via resetAttemptsForChallenge', () => {
      service.recordAttempt('challenge-a', 'u1');
      service.recordAttempt('challenge-b', 'u1');
      service.resetAttemptsForChallenge('challenge-a');

      expect(service.getAttemptInfo('challenge-a', 'u1').current).toBe(0);
      expect(service.getAttemptInfo('challenge-b', 'u1').current).toBe(1);
    });

    it('records the attempt and returns the incremented count', () => {
      const count1 = service.recordAttempt('ch', 'user');
      expect(count1).toBe(1);

      const count2 = service.recordAttempt('ch', 'user');
      expect(count2).toBe(2);
    });

    it('throws on recordAttempt with empty userId', () => {
      expect(() => service.recordAttempt('ch', '')).toThrow(BadRequestException);
    });

    it('throws on recordAttempt with empty challengeId', () => {
      expect(() => service.recordAttempt('', 'user')).toThrow(BadRequestException);
    });
  });
});
