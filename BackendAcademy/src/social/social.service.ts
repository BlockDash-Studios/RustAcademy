import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateSocialPostDto } from './dto/create-social-post.dto';
import { GetSocialFeedDto } from './dto/get-social-feed.dto';
import { UpdateModerationDto } from './dto/update-moderation.dto';
import {
  FollowResponse,
  ModerationStatus,
  MODERATION_STATUSES,
  SocialFeedResponse,
  SocialPost,
} from './interfaces/social-post.interface';
import { Hashtag, HashtagListResponse } from './interfaces/hashtag.interface';

export { ModerationStatus, SocialPost, SocialFeedResponse, FollowResponse } from './interfaces/social-post.interface';

/** Roles that are permitted to perform moderation actions. */
const MODERATOR_ROLES = new Set(['moderator', 'admin']);

@Injectable()
export class SocialService {
  private readonly posts = new Map<string, SocialPost>();
  private readonly userFollowers = new Map<string, Set<string>>();
  private readonly userFollowing = new Map<string, Set<string>>();
  /** Hashtag registry: normalised tag → Hashtag metadata */
  private readonly hashtags = new Map<string, Hashtag>();
  private idCounter = 1;

  createPost(userId: string, dto: CreateSocialPostDto): SocialPost {
    const normalizedUserId = this.normalizeUserId(userId);
    const normalizedContent = this.normalizeContent(dto.content);

    const post: SocialPost = {
      id: this.generateId(),
      userId: normalizedUserId,
      content: normalizedContent,
      createdAt: new Date(),
      updatedAt: new Date(),
      moderationStatus: 'pending',
      likes: 0,
      comments: 0,
      reposts: 0,
    };

    this.posts.set(post.id, post);
    this.indexHashtags(normalizedContent);
    return post;
  }

  getFeed(dto: GetSocialFeedDto, requesterId?: string, requesterRole?: string): SocialFeedResponse {
    const { limit = 10, status, search, userId, tag, cursor } = dto;

    // ── Visibility enforcement (Issue #686) ──────────────────────────────
    // Determine which moderation status is being requested.
    // Only moderators/admins may request non-approved statuses.
    // Public callers always see only "approved" content.
    const isModerator = requesterRole ? MODERATOR_ROLES.has(requesterRole) : false;

    let normalizedStatus: ModerationStatus;
    if (status) {
      normalizedStatus = this.normalizeStatus(status);
      // Non-moderators may not request pending/flagged/rejected feeds
      if (!isModerator && normalizedStatus !== 'approved') {
        throw new ForbiddenException({
          error: 'FORBIDDEN',
          message: 'Only moderators may access non-approved content feeds',
        });
      }
    } else {
      normalizedStatus = 'approved';
    }

    let filteredPosts = Array.from(this.posts.values()).filter(
      (post) => post.moderationStatus === normalizedStatus,
    );

    if (userId) {
      const normalizedUserId = this.normalizeUserId(userId);
      filteredPosts = filteredPosts.filter(
        (post) => post.userId === normalizedUserId,
      );
    }

    if (search) {
      const normalizedSearch = this.normalizeSearch(search);
      filteredPosts = filteredPosts.filter((post) =>
        post.content.toLowerCase().includes(normalizedSearch),
      );
    }

    if (tag) {
      const normalizedTag = this.normalizeTag(tag);
      filteredPosts = filteredPosts.filter((post) =>
        post.content.toLowerCase().includes(`#${normalizedTag}`),
      );
    }

    const sortedPosts = filteredPosts.sort((a, b) => {
      const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id);
    });

    let startIndex = 0;
    if (cursor) {
      const cursorIndex = sortedPosts.findIndex((p) => p.id === cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    const paginatedPosts = sortedPosts.slice(startIndex, startIndex + limit);
    const nextCursor =
      paginatedPosts.length === limit
        ? paginatedPosts[paginatedPosts.length - 1].id
        : undefined;

    return {
      posts: paginatedPosts,
      total: filteredPosts.length,
      nextCursor,
      limit,
    };
  }

  getPostById(postId: string): SocialPost {
    const normalizedPostId = this.normalizeId(postId, 'postId');
    const post = this.posts.get(normalizedPostId);

    if (!post) {
      throw new NotFoundException({
        error: 'POST_NOT_FOUND',
        message: `Post with ID ${normalizedPostId} not found`,
      });
    }

    return post;
  }

  /**
   * Moderates a post (approve, reject, or flag it).
   *
   * Role enforcement (Issue #686): only moderators and admins may perform
   * moderation actions on posts.
   */
  moderatePost(
    postId: string,
    moderatorId: string,
    dto: UpdateModerationDto,
    moderatorRole?: string,
  ): SocialPost {
    const normalizedPostId = this.normalizeId(postId, 'postId');
    const normalizedModeratorId = this.normalizeUserId(moderatorId);
    const normalizedStatus = this.normalizeStatus(dto.status);

    // Enforce moderator role if provided
    if (moderatorRole !== undefined && !MODERATOR_ROLES.has(moderatorRole)) {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'Only moderators may perform moderation actions',
      });
    }

    const post = this.posts.get(normalizedPostId);

    if (!post) {
      throw new NotFoundException({
        error: 'POST_NOT_FOUND',
        message: `Post with ID ${normalizedPostId} not found`,
      });
    }

    post.moderationStatus = normalizedStatus;
    post.moderatedBy = normalizedModeratorId;
    post.moderatedAt = new Date();
    post.moderationReason = dto.reason;
    post.updatedAt = new Date();

    this.posts.set(normalizedPostId, post);
    return post;
  }

  /**
   * Deletes a post.
   *
   * Ownership enforcement (Issue #686): only the post's author or a
   * moderator/admin may delete. Regular users cannot remove other users' posts.
   */
  deletePost(postId: string, requesterId?: string, requesterRole?: string): void {
    const normalizedPostId = this.normalizeId(postId, 'postId');
    const post = this.posts.get(normalizedPostId);

    if (!post) {
      throw new NotFoundException({
        error: 'POST_NOT_FOUND',
        message: `Post with ID ${normalizedPostId} not found`,
      });
    }

    // If a requesterId is provided, enforce ownership unless the requester is a moderator
    if (requesterId) {
      const normalizedRequesterId = this.normalizeUserId(requesterId);
      const isModerator = requesterRole ? MODERATOR_ROLES.has(requesterRole) : false;
      const isAuthor = post.userId === normalizedRequesterId;

      if (!isAuthor && !isModerator) {
        throw new ForbiddenException({
          error: 'FORBIDDEN',
          message: 'You are not allowed to delete this post',
        });
      }
    }

    this.posts.delete(normalizedPostId);
  }

  flagPost(postId: string, userId: string): SocialPost {
    const normalizedPostId = this.normalizeId(postId, 'postId');
    const normalizedUserId = this.normalizeUserId(userId);

    const post = this.posts.get(normalizedPostId);

    if (!post) {
      throw new NotFoundException({
        error: 'POST_NOT_FOUND',
        message: `Post with ID ${normalizedPostId} not found`,
      });
    }

    if (post.moderationStatus !== 'approved') {
      throw new BadRequestException({
        error: 'INVALID_POST_STATUS',
        message: 'Only approved posts can be flagged',
      });
    }

    post.moderationStatus = 'flagged';
    post.moderatedBy = normalizedUserId;
    post.moderatedAt = new Date();
    post.moderationReason = 'Flagged by user';
    post.updatedAt = new Date();

    this.posts.set(normalizedPostId, post);
    return post;
  }

  followUser(userId: string, targetUserId: string): FollowResponse {
    const normalizedUserId = this.normalizeUserId(userId);
    const normalizedTargetUserId = this.normalizeUserId(targetUserId);

    if (normalizedUserId === normalizedTargetUserId) {
      throw new BadRequestException({
        error: 'INVALID_FOLLOW_TARGET',
        message: 'Users cannot follow themselves',
      });
    }

    const followers = this.getRelationshipSet(this.userFollowers, normalizedTargetUserId);
    const following = this.getRelationshipSet(this.userFollowing, normalizedUserId);

    followers.add(normalizedUserId);
    following.add(normalizedTargetUserId);

    return {
      followerId: normalizedUserId,
      targetUserId: normalizedTargetUserId,
      followersCount: followers.size,
      followingCount: following.size,
    };
  }

  unfollowUser(userId: string, targetUserId: string): FollowResponse {
    const normalizedUserId = this.normalizeUserId(userId);
    const normalizedTargetUserId = this.normalizeUserId(targetUserId);

    if (normalizedUserId === normalizedTargetUserId) {
      throw new BadRequestException({
        error: 'INVALID_FOLLOW_TARGET',
        message: 'Users cannot unfollow themselves',
      });
    }

    const followers = this.userFollowers.get(normalizedTargetUserId);
    const following = this.userFollowing.get(normalizedUserId);

    if (!followers?.has(normalizedUserId) || !following?.has(normalizedTargetUserId)) {
      throw new BadRequestException({
        error: 'NOT_FOLLOWING',
        message: 'Cannot unfollow a user that is not currently followed',
      });
    }

    followers.delete(normalizedUserId);
    following.delete(normalizedTargetUserId);

    return {
      followerId: normalizedUserId,
      targetUserId: normalizedTargetUserId,
      followersCount: followers.size,
      followingCount: following.size,
    };
  }

  getFlaggedPosts(): SocialPost[] {
    return Array.from(this.posts.values()).filter(
      (post) => post.moderationStatus === 'flagged',
    );
  }

  getModerationQueue(): SocialPost[] {
    return Array.from(this.posts.values()).filter(
      (post) => post.moderationStatus === 'pending' || post.moderationStatus === 'flagged',
    );
  }

  bulkModerate(moderatorId: string, actions: Array<{ postId: string; status: ModerationStatus; reason?: string }>): number {
    let count = 0;
    for (const action of actions) {
      try {
        this.moderatePost(action.postId, moderatorId, { status: action.status, reason: action.reason });
        count++;
      } catch {
        continue;
      }
    }
    return count;
  }

  getPendingPosts(): SocialPost[] {
    return Array.from(this.posts.values()).filter(
      (post) => post.moderationStatus === 'pending',
    );
  }

  /**
   * #354: Returns all posts authored by a given user.
   */
  getPostsByUserId(userId: string): SocialPost[] {
    const normalizedUserId = this.normalizeUserId(userId);
    return Array.from(this.posts.values()).filter(
      (post) => post.userId === normalizedUserId,
    );
  }

  likePost(postId: string): SocialPost {
    const post = this.getPostById(postId);
    post.likes++;
    post.updatedAt = new Date();
    this.posts.set(postId, post);
    return post;
  }

  commentOnPost(postId: string): SocialPost {
    const post = this.getPostById(postId);
    post.comments++;
    post.updatedAt = new Date();
    this.posts.set(postId, post);
    return post;
  }

  repostPost(postId: string): SocialPost {
    const post = this.getPostById(postId);
    post.reposts++;
    post.updatedAt = new Date();
    this.posts.set(postId, post);
    return post;
  }

  // ---------------------------------------------------------------------------
  // Hashtag discovery — Issue #173
  // ---------------------------------------------------------------------------

  /**
   * Returns all known hashtags, ordered by postCount descending,
   * with optional text filtering and pagination.
   */
  discoverHashtags(
    query?: string,
    page = 1,
    limit = 20,
  ): HashtagListResponse {
    const normalizedQuery = query?.trim().toLowerCase().replace(/^#/, '');

    let tags = Array.from(this.hashtags.values());

    if (normalizedQuery) {
      tags = tags.filter((h) => h.tag.includes(normalizedQuery));
    }

    // Most-used first
    tags.sort((a, b) => b.postCount - a.postCount);

    const total = tags.length;
    const startIndex = (page - 1) * limit;
    const paginated = tags.slice(startIndex, startIndex + limit);

    return { hashtags: paginated, total, page, limit };
  }

  /**
   * Returns the top N trending hashtags (highest postCount).
   */
  getTrendingHashtags(limit = 10): Hashtag[] {
    return Array.from(this.hashtags.values())
      .sort((a, b) => b.postCount - a.postCount)
      .slice(0, limit);
  }

  /**
   * Returns posts that contain a specific hashtag, paginated.
   */
  getPostsByHashtag(
    tag: string,
    cursor?: string,
    limit = 10,
  ): SocialFeedResponse {
    const normalizedTag = this.normalizeTag(tag);

    const matchingPosts = Array.from(this.posts.values())
      .filter(
        (post) =>
          post.moderationStatus === 'approved' &&
          post.content.toLowerCase().includes(`#${normalizedTag}`),
      )
      .sort((a, b) => {
        const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.id.localeCompare(a.id);
      });

    let startIndex = 0;
    if (cursor) {
      const cursorIndex = matchingPosts.findIndex((p) => p.id === cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    const paginated = matchingPosts.slice(startIndex, startIndex + limit);
    const nextCursor =
      paginated.length === limit
        ? paginated[paginated.length - 1].id
        : undefined;

    return { posts: paginated, total: matchingPosts.length, nextCursor, limit };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extracts all hashtags from a post's content and upserts them in the
   * internal registry, incrementing their postCount.
   */
  private indexHashtags(content: string): void {
    const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
    const now = new Date();
    let match: RegExpExecArray | null;

    // eslint-disable-next-line no-cond-assign
    while ((match = hashtagRegex.exec(content)) !== null) {
      const tag = match[1].toLowerCase();
      const existing = this.hashtags.get(tag);

      if (existing) {
        existing.postCount++;
        existing.lastUsedAt = now;
        this.hashtags.set(tag, existing);
      } else {
        this.hashtags.set(tag, {
          tag,
          postCount: 1,
          firstSeenAt: now,
          lastUsedAt: now,
        });
      }
    }
  }

  private generateId(): string {
    return `post_${this.idCounter++}`;
  }

  private normalizeId(value: string | undefined, field: string): string {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException({
        error: 'INVALID_INPUT',
        message: `${field} is required`,
      });
    }
    return normalized;
  }

  private normalizeUserId(userId: string): string {
    return this.normalizeId(userId, 'userId');
  }

  private normalizeContent(content: string): string {
    const normalized = content?.trim();
    if (!normalized) {
      throw new BadRequestException({
        error: 'INVALID_CONTENT',
        message: 'Content is required',
      });
    }
    if (normalized.length > 5000) {
      throw new BadRequestException({
        error: 'INVALID_CONTENT',
        message: 'Content must be less than 5000 characters',
      });
    }
    return normalized;
  }

  private getRelationshipSet(map: Map<string, Set<string>>, key: string): Set<string> {
    if (!map.has(key)) {
      map.set(key, new Set<string>());
    }
    return map.get(key)!;
  }

  private normalizeStatus(status: string): ModerationStatus {
    const validStatuses: readonly string[] = MODERATION_STATUSES;
    if (!validStatuses.includes(status)) {
      throw new BadRequestException({
        error: 'INVALID_STATUS',
        message: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }
    return status as ModerationStatus;
  }

  private normalizeSearch(search: string): string {
    return search.trim().toLowerCase();
  }

  private normalizeTag(tag: string): string {
    const normalized = tag.trim().toLowerCase();
    return normalized.startsWith('#') ? normalized.slice(1) : normalized;
  }
}
