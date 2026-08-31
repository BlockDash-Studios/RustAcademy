/**
 * SocialController unit tests — Issue #686
 *
 * Covers:
 *  - Feed / discovery endpoints pass requester context through to the service
 *  - Moderator role forwarded on moderate endpoint
 *  - Delete endpoint forwards requester context
 */
import { ForbiddenException } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

describe('SocialController', () => {
  let controller: SocialController;
  let service: SocialService;

  beforeEach(() => {
    service = new SocialService();
    controller = new SocialController(service);
  });

  // ── Discovery alias ─────────────────────────────────────────────────────────

  it('should return the same feed from discovery alias', () => {
    const post = service.createPost('user-1', { content: 'Hello #rust' });
    service.moderatePost(post.id, 'moderator-1', { status: 'approved' }, 'moderator');

    const feed = controller.getFeed({});
    const discovery = controller.getDiscovery({});

    expect(discovery).toEqual(feed);
    expect(discovery.posts[0].id).toBe(post.id);
  });

  // ── Visibility via controller ───────────────────────────────────────────────

  it('public feed (no requester) returns only approved posts', () => {
    service.createPost('user-1', { content: 'Pending post' }); // pending

    const result = controller.getFeed({});
    expect(result.posts).toHaveLength(0);
  });

  it('non-moderator requesting pending feed throws ForbiddenException', () => {
    expect(() =>
      controller.getFeed({ status: 'pending' }, 'user-1', 'user'),
    ).toThrow(ForbiddenException);
  });

  it('moderator can request pending feed via controller', () => {
    service.createPost('user-1', { content: 'Pending post' });

    const result = controller.getFeed({ status: 'pending' }, 'mod-1', 'moderator');
    expect(result.posts).toHaveLength(1);
  });

  // ── Ownership via controller ────────────────────────────────────────────────

  it('author can delete their own post via controller', () => {
    const post = service.createPost('user-1', { content: 'My post' });
    expect(() => controller.deletePost(post.id, 'user-1')).not.toThrow();
  });

  it('non-owner cannot delete someone else\'s post via controller', () => {
    const post = service.createPost('user-1', { content: 'My post' });
    expect(() => controller.deletePost(post.id, 'user-2')).toThrow(ForbiddenException);
  });

  it('moderator can delete any post via controller', () => {
    const post = service.createPost('user-1', { content: 'My post' });
    expect(() => controller.deletePost(post.id, 'mod-1', 'moderator')).not.toThrow();
  });

  // ── Moderate endpoint ───────────────────────────────────────────────────────

  it('moderator can approve a post via controller', () => {
    const post = service.createPost('user-1', { content: 'Test post' });
    const result = controller.moderatePost(post.id, 'mod-1', 'moderator', { status: 'approved' });
    expect(result.moderationStatus).toBe('approved');
  });

  it('non-moderator cannot approve a post via controller', () => {
    const post = service.createPost('user-1', { content: 'Test post' });
    expect(() =>
      controller.moderatePost(post.id, 'user-1', 'user', { status: 'approved' }),
    ).toThrow(ForbiddenException);
  });
});
