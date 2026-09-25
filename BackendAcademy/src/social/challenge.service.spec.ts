import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ChallengeService } from './challenge.service';

const POT = 10_000_000n; // 1 XLM in stroops

describe('ChallengeService', () => {
  let service: ChallengeService;

  beforeEach(() => {
    service = new ChallengeService();
    service.create({ challengeId: 'wk-1', title: 'Week 1: no_std parsing', potStroops: POT });
  });

  /** Drives a challenge to `voting` with two entries. */
  const withEntries = () => {
    service.submit('wk-1', { userId: 'alice', submissionId: 'sub-a' });
    service.submit('wk-1', { userId: 'bob', submissionId: 'sub-b' });
    service.openVoting('wk-1');
  };

  describe('creation', () => {
    it('starts open', () => {
      expect(service.get('wk-1').state).toBe('open');
    });

    it('rejects a duplicate id', () => {
      expect(() =>
        service.create({ challengeId: 'wk-1', title: 'again', potStroops: POT }),
      ).toThrow(BadRequestException);
    });

    it('rejects a negative pot', () => {
      expect(() =>
        service.create({ challengeId: 'wk-2', title: 'bad', potStroops: -1n }),
      ).toThrow(BadRequestException);
    });

    it('throws for an unknown challenge', () => {
      expect(() => service.get('nope')).toThrow(NotFoundException);
    });
  });

  describe('lifecycle is enforced by the state machine', () => {
    it('allows open → voting → closed', () => {
      expect(service.openVoting('wk-1').state).toBe('voting');
      expect(service.close('wk-1').challenge.state).toBe('closed');
    });

    it('refuses to skip voting', () => {
      expect(() => service.close('wk-1')).toThrow(/from open to closed/);
    });

    it('refuses to reopen voting once closed', () => {
      service.openVoting('wk-1');
      service.close('wk-1');

      expect(() => service.openVoting('wk-1')).toThrow(/from closed to voting/);
    });

    it('refuses to enter voting twice', () => {
      service.openVoting('wk-1');
      expect(() => service.openVoting('wk-1')).toThrow(/from voting to voting/);
    });

    it('refuses to close twice', () => {
      service.openVoting('wk-1');
      service.close('wk-1');
      expect(() => service.close('wk-1')).toThrow(/from closed to closed/);
    });
  });

  describe('submissions', () => {
    it('accepts entries while open', () => {
      service.submit('wk-1', { userId: 'alice', submissionId: 'sub-a' });
      expect(service.getSubmissions('wk-1')).toHaveLength(1);
    });

    it('rejects a duplicate submission id', () => {
      service.submit('wk-1', { userId: 'alice', submissionId: 'sub-a' });
      expect(() => service.submit('wk-1', { userId: 'bob', submissionId: 'sub-a' })).toThrow(
        BadRequestException,
      );
    });

    it('rejects entries once voting has opened', () => {
      service.openVoting('wk-1');
      expect(() => service.submit('wk-1', { userId: 'x', submissionId: 's' })).toThrow(
        /must be open to accept submissions/,
      );
    });
  });

  describe('voting window', () => {
    it('rejects votes before voting opens', () => {
      service.submit('wk-1', { userId: 'alice', submissionId: 'sub-a' });
      expect(() => service.vote('wk-1', { voterId: 'carol', submissionId: 'sub-a' })).toThrow(
        /must be voting to accept votes/,
      );
    });

    it('rejects votes after closing', () => {
      withEntries();
      service.close('wk-1');
      expect(() => service.vote('wk-1', { voterId: 'carol', submissionId: 'sub-a' })).toThrow(
        /must be voting to accept votes/,
      );
    });

    it('counts a vote', () => {
      withEntries();
      service.vote('wk-1', { voterId: 'carol', submissionId: 'sub-a' });
      expect(service.getTally('wk-1')).toEqual({ 'sub-a': 1 });
    });

    it('allows one vote per account', () => {
      withEntries();
      service.vote('wk-1', { voterId: 'carol', submissionId: 'sub-a' });
      expect(() => service.vote('wk-1', { voterId: 'carol', submissionId: 'sub-b' })).toThrow(
        /already voted/,
      );
    });

    it('rejects a self-vote', () => {
      withEntries();
      expect(() => service.vote('wk-1', { voterId: 'alice', submissionId: 'sub-a' })).toThrow(
        /cannot vote for their own submission/,
      );
    });

    it('rejects a vote for an unknown submission', () => {
      withEntries();
      expect(() => service.vote('wk-1', { voterId: 'carol', submissionId: 'ghost' })).toThrow(
        /Unknown submission/,
      );
    });
  });

  describe('closing queues a payout for BE-053', () => {
    it('awards the whole pot to a single winner', () => {
      withEntries();
      service.vote('wk-1', { voterId: 'carol', submissionId: 'sub-a' });

      const { payout } = service.close('wk-1');

      expect(payout.winningSubmissionIds).toEqual(['sub-a']);
      expect(payout.awards['sub-a']).toBe(POT);
      expect(payout.votes).toBe(1);
    });

    it('splits the pot between tied winners', () => {
      withEntries();
      service.vote('wk-1', { voterId: 'carol', submissionId: 'sub-a' });
      service.vote('wk-1', { voterId: 'dave', submissionId: 'sub-b' });

      const { payout } = service.close('wk-1');

      expect(payout.winningSubmissionIds).toEqual(['sub-a', 'sub-b']);
      expect(payout.awards['sub-a']).toBe(POT / 2n);
      expect(payout.awards['sub-b']).toBe(POT / 2n);
    });

    it('gives an indivisible remainder to the first winner so awards sum to the pot', () => {
      // 10 stroops between 3 winners: 4 + 3 + 3, not 3.33 each.
      service.create({ challengeId: 'wk-2', title: 'odd pot', potStroops: 10n });
      service.submit('wk-2', { userId: 'a', submissionId: 's-a' });
      service.submit('wk-2', { userId: 'b', submissionId: 's-b' });
      service.submit('wk-2', { userId: 'c', submissionId: 's-c' });
      service.openVoting('wk-2');
      service.vote('wk-2', { voterId: 'v1', submissionId: 's-a' });
      service.vote('wk-2', { voterId: 'v2', submissionId: 's-b' });
      service.vote('wk-2', { voterId: 'v3', submissionId: 's-c' });

      const { payout } = service.close('wk-2');

      expect(payout.awards).toEqual({ 's-a': 4n, 's-b': 3n, 's-c': 3n });
      const total = Object.values(payout.awards).reduce((sum, v) => sum + v, 0n);
      expect(total).toBe(10n);
    });

    it('queues no winners and no awards when nobody voted', () => {
      withEntries();

      const { payout } = service.close('wk-1');

      expect(payout.winningSubmissionIds).toEqual([]);
      expect(payout.awards).toEqual({});
      expect(payout.votes).toBe(0);
    });

    it('enqueues the payout rather than paying it', () => {
      withEntries();
      service.vote('wk-1', { voterId: 'carol', submissionId: 'sub-a' });

      expect(service.getPendingPayouts()).toHaveLength(0);
      service.close('wk-1');

      const pending = service.getPendingPayouts();
      expect(pending).toHaveLength(1);
      expect(pending[0].challengeId).toBe('wk-1');
    });
  });
});
