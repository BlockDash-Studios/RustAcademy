import { BadRequestException } from '@nestjs/common';
import { FollowService } from './follow.service';
import { DEFAULT_RANK_WEIGHT, FOLLOW_RANK_WEIGHT } from './social.types';

describe('FollowService', () => {
  let service: FollowService;

  beforeEach(() => {
    service = new FollowService();
  });

  const post = (itemId: string, authorId: string, createdAt: string) => ({
    itemId,
    authorId,
    kind: 'post' as const,
    createdAt,
  });

  describe('follow graph', () => {
    it('records an edge in both directions', () => {
      service.follow('learner-1', 'tutor-1');

      expect(service.isFollowing('learner-1', 'tutor-1')).toBe(true);
      expect(service.getFollowing('learner-1')).toEqual(['tutor-1']);
      expect(service.getFollowers('tutor-1')).toEqual(['learner-1']);
    });

    it('is not symmetric', () => {
      service.follow('learner-1', 'tutor-1');
      expect(service.isFollowing('tutor-1', 'learner-1')).toBe(false);
    });

    it('is idempotent and keeps the original followedAt', () => {
      const first = service.follow('learner-1', 'tutor-1');
      const second = service.follow('learner-1', 'tutor-1');

      expect(second).toEqual(first);
      expect(service.getFollowing('learner-1')).toHaveLength(1);
    });

    it('rejects self-follow', () => {
      expect(() => service.follow('learner-1', 'learner-1')).toThrow(BadRequestException);
    });

    it('reports counts for both sides', () => {
      service.follow('learner-1', 'tutor-1');
      service.follow('learner-2', 'tutor-1');
      service.follow('tutor-1', 'tutor-2');

      expect(service.getCounts('tutor-1')).toEqual({ followers: 2, following: 1 });
    });

    it('removes the edge on unfollow and reports whether anything was removed', () => {
      service.follow('learner-1', 'tutor-1');

      expect(service.unfollow('learner-1', 'tutor-1')).toBe(true);
      expect(service.isFollowing('learner-1', 'tutor-1')).toBe(false);
      expect(service.getFollowers('tutor-1')).toEqual([]);

      // Second call is a no-op rather than an error.
      expect(service.unfollow('learner-1', 'tutor-1')).toBe(false);
    });
  });

  describe('fan-out', () => {
    it('delivers to current followers only', () => {
      service.follow('learner-1', 'tutor-1');

      const recipients = service.fanOut(post('item-1', 'tutor-1', '2026-09-25T10:00:00Z'));

      expect(recipients).toEqual(['learner-1']);
      expect(service.getFeed('learner-1')).toHaveLength(1);
      expect(service.getFeed('learner-2')).toHaveLength(0);
    });

    it('delivers nothing when the author has no followers', () => {
      expect(service.fanOut(post('item-1', 'tutor-1', '2026-09-25T10:00:00Z'))).toEqual([]);
    });
  });

  describe('unfollow removes future fan-out but not history', () => {
    it('keeps items delivered before the unfollow', () => {
      service.follow('learner-1', 'tutor-1');
      service.fanOut(post('before', 'tutor-1', '2026-09-25T10:00:00Z'));

      service.unfollow('learner-1', 'tutor-1');

      const feed = service.getFeed('learner-1');
      expect(feed.map((i) => i.itemId)).toEqual(['before']);
    });

    it('stops delivering items published after the unfollow', () => {
      service.follow('learner-1', 'tutor-1');
      service.fanOut(post('before', 'tutor-1', '2026-09-25T10:00:00Z'));
      service.unfollow('learner-1', 'tutor-1');

      const recipients = service.fanOut(post('after', 'tutor-1', '2026-09-25T11:00:00Z'));

      expect(recipients).toEqual([]);
      expect(service.getFeed('learner-1').map((i) => i.itemId)).toEqual(['before']);
    });

    it('flags retained items as historical', () => {
      service.follow('learner-1', 'tutor-1');
      service.fanOut(post('before', 'tutor-1', '2026-09-25T10:00:00Z'));
      service.unfollow('learner-1', 'tutor-1');

      const [item] = service.getFeed('learner-1');
      expect(item.historical).toBe(true);
      expect(item.rankWeight).toBe(DEFAULT_RANK_WEIGHT);
    });

    it('resumes fan-out and clears the historical flag on re-follow', () => {
      service.follow('learner-1', 'tutor-1');
      service.fanOut(post('before', 'tutor-1', '2026-09-25T10:00:00Z'));
      service.unfollow('learner-1', 'tutor-1');
      service.follow('learner-1', 'tutor-1');

      service.fanOut(post('after', 'tutor-1', '2026-09-25T11:00:00Z'));

      const feed = service.getFeed('learner-1');
      expect(feed.map((i) => i.itemId).sort()).toEqual(['after', 'before']);
      expect(feed.every((i) => i.historical)).toBe(false);
    });
  });

  describe('feed ranking weights follows', () => {
    it('ranks followed authors above unfollowed ones', () => {
      service.follow('learner-1', 'tutor-followed');
      service.follow('learner-1', 'tutor-dropped');
      service.fanOut(post('from-dropped', 'tutor-dropped', '2026-09-25T12:00:00Z'));
      service.fanOut(post('from-followed', 'tutor-followed', '2026-09-25T10:00:00Z'));

      service.unfollow('learner-1', 'tutor-dropped');

      const feed = service.getFeed('learner-1');
      // Followed author wins despite being older, because weight sorts first.
      expect(feed.map((i) => i.itemId)).toEqual(['from-followed', 'from-dropped']);
      expect(feed[0].rankWeight).toBe(FOLLOW_RANK_WEIGHT);
      expect(feed[1].rankWeight).toBe(DEFAULT_RANK_WEIGHT);
    });

    it('orders newest first within the same weight', () => {
      service.follow('learner-1', 'tutor-1');
      service.fanOut(post('older', 'tutor-1', '2026-09-25T10:00:00Z'));
      service.fanOut(post('newer', 'tutor-1', '2026-09-25T12:00:00Z'));

      expect(service.getFeed('learner-1').map((i) => i.itemId)).toEqual(['newer', 'older']);
    });

    it('returns an empty feed for an unknown viewer', () => {
      expect(service.getFeed('nobody')).toEqual([]);
    });
  });
});
