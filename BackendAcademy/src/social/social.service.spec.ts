import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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

  it('should return only approved posts by default', () => {
    const firstPost = service.createPost('user-1', { content: 'First post' });
    const secondPost = service.createPost('user-2', { content: 'Second post' });

    service.moderatePost(firstPost.id, 'moderator-1', {
      status: 'approved',
    });

    const result = service.getFeed({});

    expect(result.posts.length).toBe(1);
    expect(result.posts[0].id).toBe(firstPost.id);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it('should support search filtering', () => {
    const firstPost = service.createPost('user-1', { content: 'Learning Rust is fun' });
    const secondPost = service.createPost('user-2', { content: 'Another post' });

    service.moderatePost(firstPost.id, 'moderator-1', {
      status: 'approved',
    });
    service.moderatePost(secondPost.id, 'moderator-1', {
      status: 'approved',
    });

    const result = service.getFeed({ search: 'rust' });

    expect(result.posts.length).toBe(1);
    expect(result.posts[0].id).toBe(firstPost.id);
  });

  it('should support userId filtering', () => {
    const firstPost = service.createPost('user-1', { content: 'First post' });
    const secondPost = service.createPost('user-2', { content: 'Second post' });

    service.moderatePost(firstPost.id, 'moderator-1', { status: 'approved' });
    service.moderatePost(secondPost.id, 'moderator-1', { status: 'approved' });

    const result = service.getFeed({ userId: 'user-2' });

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].userId).toBe('user-2');
  });

  it('should support tag filtering using hashtags', () => {
    const firstPost = service.createPost('user-1', { content: 'Welcome to #rust' });
    const secondPost = service.createPost('user-2', { content: 'No hashtag here' });

    service.moderatePost(firstPost.id, 'moderator-1', { status: 'approved' });
    service.moderatePost(secondPost.id, 'moderator-1', { status: 'approved' });

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
});
