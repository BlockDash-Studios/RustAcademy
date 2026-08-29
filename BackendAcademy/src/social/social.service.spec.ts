/**
 * SocialService unit tests — Issue #686
 *
 * Covers:
 *  - Moderation-status visibility (pending/flagged posts do NOT leak into public feeds)
 *  - Post ownership enforcement (only the author or a moderator may delete)
 *  - Moderator role gates on moderate action
 *  - Existing feed / follow / hashtag functionality
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SocialService } from './social.service';
import { CreateSocialPostDto } from './dto/create-social-post.dto';
import { UpdateModerationDto } from './dto/update-moderation.dto';

describe('SocialService', () => {
  let service: SocialService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SocialService],
    }).compile();

    service = module.get<SocialService>(SocialService);
  });

  // ── Basic feed ──────────────────────────────────────────────────────────────

  it('should return only approved posts by default', () => {
    const firstPost = service.createPost('user-1', { content: 'First post' });
    service.createPost('user-2', { content: 'Second post' });

    service.moderatePost(firstPost.id, 'moderator-1', { status: 'approved' }, 'moderator');

    const result = service.getFeed({});

    expect(result.posts.length).toBe(1);
    expect(result.posts[0].id).toBe(firstPost.id);
    expect(result.total).toBe(1);
  });

  it('should support search filtering', () => {
    const firstPost = service.createPost('user-1', { content: 'Learning Rust is fun' });
    const secondPost = service.createPost('user-2', { content: 'Another post' });

    service.moderatePost(firstPost.id, 'mod', { status: 'approved' }, 'moderator');
    service.moderatePost(secondPost.id, 'mod', { status: 'approved' }, 'moderator');

    const result = service.getFeed({ search: 'rust' });

    expect(result.posts.length).toBe(1);
    expect(result.posts[0].id).toBe(firstPost.id);
  });

  it('should support userId filtering', () => {
    const firstPost = service.createPost('user-1', { content: 'First post' });
    const secondPost = service.createPost('user-2', { content: 'Second post' });

    service.moderatePost(firstPost.id, 'mod', { status: 'approved' }, 'moderator');
    service.moderatePost(secondPost.id, 'mod', { status: 'approved' }, 'moderator');

    const result = service.getFeed({ userId: 'user-2' });

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].userId).toBe('user-2');
  });

  it('should support tag filtering using hashtags', () => {
    const firstPost = service.createPost('user-1', { content: 'Welcome to #rust' });
    const secondPost = service.createPost('user-2', { content: 'No hashtag here' });

    service.moderatePost(firstPost.id, 'mod', { status: 'approved' }, 'moderator');
    service.moderatePost(secondPost.id, 'mod', { status: 'approved' }, 'moderator');

    const result = service.getFeed({ tag: 'rust' });

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].id).toBe(firstPost.id);
  });

  it('should throw NotFoundException for missing post on getPostById', () => {
    expect(() => service.getPostById('missing')).toThrow(NotFoundException);
  });

  it('should throw BadRequestException for invalid status filter', () => {
    expect(() => service.getFeed({ status: 'invalid' as any })).toThrow(BadRequestException);
  });

  // ── Visibility enforcement — Issue #686 ────────────────────────────────────

  describe('Visibility enforcement', () => {
    it('pending posts do NOT appear in the default public feed', () => {
      service.createPost('user-1', { content: 'Pending post' });
      const result = service.getFeed({});
      expect(result.posts).toHaveLength(0);
    });

    it('flagged posts do NOT appear in the default public feed', () => {
      const post = service.createPost('user-1', { content: 'Flagged post' });
      service.moderatePost(post.id, 'mod', { status: 'approved' }, 'moderator');
      service.flagPost(post.id, 'reporter');
      const result = service.getFeed({});
      expect(result.posts).toHaveLength(0);
    });

    it('rejected posts do NOT appear in the default public feed', () => {
      const post = service.createPost('user-1', { content: 'Rejected post' });
      service.moderatePost(post.id, 'mod', { status: 'rejected' }, 'moderator');
      const result = service.getFeed({});
      expect(result.posts).toHaveLength(0);
    });

    it('non-moderator cannot request the pending feed', () => {
      expect(() =>
        service.getFeed({ status: 'pending' }, 'user-1', 'user'),
      ).toThrow(ForbiddenException);
    });

    it('non-moderator cannot request the flagged feed', () => {
      expect(() =>
        service.getFeed({ status: 'flagged' }, 'user-1', 'user'),
      ).toThrow(ForbiddenException);
    });

    it('moderator can request the pending feed', () => {
      service.createPost('user-1', { content: 'Pending content' });
      const result = service.getFeed({ status: 'pending' }, 'mod-1', 'moderator');
      expect(result.posts).toHaveLength(1);
    });

    it('admin can request the pending feed', () => {
      service.createPost('user-1', { content: 'Pending content' });
      const result = service.getFeed({ status: 'pending' }, 'admin-1', 'admin');
      expect(result.posts).toHaveLength(1);
    });

    it('moderator can request the flagged feed', () => {
      const post = service.createPost('user-1', { content: 'Test' });
      service.moderatePost(post.id, 'mod', { status: 'approved' }, 'moderator');
      service.flagPost(post.id, 'reporter');

      const result = service.getFeed({ status: 'flagged' }, 'mod-1', 'moderator');
      expect(result.posts).toHaveLength(1);
    });

    it('getFeed without status or role always returns only approved posts', () => {
      const post = service.createPost('user-1', { content: 'Approved post' });
      service.createPost('user-2', { content: 'Pending post' });

      service.moderatePost(post.id, 'mod', { status: 'approved' }, 'moderator');

      const result = service.getFeed({});
      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].id).toBe(post.id);
    });
  });

  // ── Post ownership enforcement — Issue #686 ────────────────────────────────

  describe('Post ownership enforcement', () => {
    it('author can delete their own post', () => {
      const post = service.createPost('user-1', { content: 'My post' });
      expect(() => service.deletePost(post.id, 'user-1')).not.toThrow();
      expect(() => service.getPostById(post.id)).toThrow(NotFoundException);
    });

    it('another user cannot delete a post they do not own', () => {
      const post = service.createPost('user-1', { content: 'My post' });
      expect(() => service.deletePost(post.id, 'user-2')).toThrow(ForbiddenException);
    });

    it('moderator can delete any post regardless of ownership', () => {
      const post = service.createPost('user-1', { content: 'My post' });
      expect(() => service.deletePost(post.id, 'mod-1', 'moderator')).not.toThrow();
    });

    it('admin can delete any post regardless of ownership', () => {
      const post = service.createPost('user-1', { content: 'My post' });
      expect(() => service.deletePost(post.id, 'admin-1', 'admin')).not.toThrow();
    });

    it('deletePost without requesterId deletes unconditionally (legacy / internal)', () => {
      const post = service.createPost('user-1', { content: 'My post' });
      expect(() => service.deletePost(post.id)).not.toThrow();
    });
  });

  // ── Moderator role enforcement — Issue #686 ────────────────────────────────

  describe('Moderator role enforcement on moderatePost', () => {
    it('moderator can approve a post', () => {
      const post = service.createPost('user-1', { content: 'Test post' });
      const moderated = service.moderatePost(post.id, 'mod-1', { status: 'approved' }, 'moderator');
      expect(moderated.moderationStatus).toBe('approved');
      expect(moderated.moderatedBy).toBe('mod-1');
    });

    it('admin can approve a post', () => {
      const post = service.createPost('user-1', { content: 'Test post' });
      const moderated = service.moderatePost(post.id, 'admin-1', { status: 'approved' }, 'admin');
      expect(moderated.moderationStatus).toBe('approved');
    });

    it('moderator can reject a post', () => {
      const post = service.createPost('user-1', { content: 'Test post' });
      const moderated = service.moderatePost(post.id, 'mod-1', { status: 'rejected', reason: 'spam' }, 'moderator');
      expect(moderated.moderationStatus).toBe('rejected');
      expect(moderated.moderationReason).toBe('spam');
    });

    it('non-moderator user cannot moderate a post', () => {
      const post = service.createPost('user-1', { content: 'Test post' });
      expect(() =>
        service.moderatePost(post.id, 'user-2', { status: 'approved' }, 'user'),
      ).toThrow(ForbiddenException);
    });

    it('moderatePost without role still works (legacy / internal callers)', () => {
      const post = service.createPost('user-1', { content: 'Test post' });
      const moderated = service.moderatePost(post.id, 'mod-1', { status: 'approved' });
      expect(moderated.moderationStatus).toBe('approved');
    });
  });

  // ── Follow / Unfollow ───────────────────────────────────────────────────────

  it('should follow and unfollow a user', () => {
    const followResponse = service.followUser('user-1', 'user-2');

    expect(followResponse.followerId).toBe('user-1');
    expect(followResponse.targetUserId).toBe('user-2');
    expect(followResponse.followersCount).toBe(1);
    expect(followResponse.followingCount).toBe(1);

    const unfollowResponse = service.unfollowUser('user-1', 'user-2');

    expect(unfollowResponse.followerId).toBe('user-1');
    expect(unfollowResponse.targetUserId).toBe('user-2');
    expect(unfollowResponse.followersCount).toBe(0);
    expect(unfollowResponse.followingCount).toBe(0);
  });

  it('should not allow self follow', () => {
    expect(() => service.followUser('user-1', 'user-1')).toThrow(BadRequestException);
  });

  it('should not allow unfollow when not following', () => {
    expect(() => service.unfollowUser('user-1', 'user-2')).toThrow(BadRequestException);
  });

  // ── Moderation queue ────────────────────────────────────────────────────────

  it('getModerationQueue returns pending and flagged posts', () => {
    const p1 = service.createPost('user-1', { content: 'Post 1' }); // pending
    const p2 = service.createPost('user-2', { content: 'Post 2' });
    service.moderatePost(p2.id, 'mod', { status: 'approved' }, 'moderator');
    service.flagPost(p2.id, 'reporter'); // approved → flagged

    const queue = service.getModerationQueue();
    expect(queue.map((p) => p.id)).toEqual(expect.arrayContaining([p1.id, p2.id]));
  });
});
