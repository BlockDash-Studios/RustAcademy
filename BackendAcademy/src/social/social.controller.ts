import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CreateSocialPostDto } from './dto/create-social-post.dto';
import { GetSocialFeedDto } from './dto/get-social-feed.dto';
import { UpdateModerationDto } from './dto/update-moderation.dto';
import { HashtagSearchDto } from './dto/hashtag-search.dto';
import {
  FollowResponse,
  SocialFeedResponse,
  SocialPost,
} from './interfaces/social-post.interface';
import {
  Hashtag,
  HashtagListResponse,
} from './interfaces/hashtag.interface';
import { SocialService } from './social.service';

@Controller('social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Post('posts')
  @HttpCode(HttpStatus.CREATED)
  createPost(
    @Body() dto: CreateSocialPostDto,
    @Query('userId') userId: string,
  ): SocialPost {
    return this.socialService.createPost(userId, dto);
  }

  @Get('feed')
  getFeed(@Query() dto: GetSocialFeedDto): SocialFeedResponse {
    return this.socialService.getFeed(dto);
  }

  @Get('discovery')
  getDiscovery(@Query() dto: GetSocialFeedDto): SocialFeedResponse {
    return this.socialService.getFeed(dto);
  }

  @Get('posts/:postId')
  getPostById(@Param('postId') postId: string): SocialPost {
    return this.socialService.getPostById(postId);
  }

  @Put('posts/:postId/moderate')
  @HttpCode(HttpStatus.OK)
  moderatePost(
    @Param('postId') postId: string,
    @Query('moderatorId') moderatorId: string,
    @Body() dto: UpdateModerationDto,
  ): SocialPost {
    return this.socialService.moderatePost(postId, moderatorId, dto);
  }

  @Post('posts/:postId/flag')
  @HttpCode(HttpStatus.OK)
  flagPost(
    @Param('postId') postId: string,
    @Query('userId') userId: string,
  ): SocialPost {
    return this.socialService.flagPost(postId, userId);
  }

  @Post('posts/:postId/like')
  @HttpCode(HttpStatus.OK)
  likePost(@Param('postId') postId: string): SocialPost {
    return this.socialService.likePost(postId);
  }

  @Post('posts/:postId/comment')
  @HttpCode(HttpStatus.OK)
  commentOnPost(@Param('postId') postId: string): SocialPost {
    return this.socialService.commentOnPost(postId);
  }

  @Post('posts/:postId/repost')
  @HttpCode(HttpStatus.OK)
  repostPost(@Param('postId') postId: string): SocialPost {
    return this.socialService.repostPost(postId);
  }

  @Delete('posts/:postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePost(@Param('postId') postId: string): void {
    this.socialService.deletePost(postId);
  }

  @Post('users/:userId/follow/:targetUserId')
  @HttpCode(HttpStatus.OK)
  followUser(
    @Param('userId') userId: string,
    @Param('targetUserId') targetUserId: string,
  ): FollowResponse {
    return this.socialService.followUser(userId, targetUserId);
  }

  @Delete('users/:userId/follow/:targetUserId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unfollowUser(
    @Param('userId') userId: string,
    @Param('targetUserId') targetUserId: string,
  ): void {
    this.socialService.unfollowUser(userId, targetUserId);
  }

  @Get('moderation/pending')
  getPendingPosts(): SocialPost[] {
    return this.socialService.getPendingPosts();
  }

  // ---------------------------------------------------------------------------
  // Hashtag discovery — Issue #173
  // ---------------------------------------------------------------------------

  /**
   * GET /social/hashtags
   *
   * Discover all hashtags used on the platform with optional text search
   * and pagination.  Results are ordered by postCount descending.
   *
   * Query params:
   *   query  — partial tag text to filter by (without '#')
   *   page   — 1-based page number (default 1)
   *   limit  — results per page (default 20)
   */
  @Get('hashtags')
  @HttpCode(HttpStatus.OK)
  discoverHashtags(@Query() dto: HashtagSearchDto): HashtagListResponse {
    return this.socialService.discoverHashtags(dto.query, dto.page, dto.limit);
  }

  /**
   * GET /social/hashtags/trending
   *
   * Returns the top trending hashtags by usage count.
   *
   * Query params:
   *   limit — number of hashtags to return (default 10)
   */
  @Get('hashtags/trending')
  @HttpCode(HttpStatus.OK)
  getTrendingHashtags(
    @Query('limit') limit = 10,
  ): Hashtag[] {
    return this.socialService.getTrendingHashtags(Number(limit));
  }

  /**
   * GET /social/hashtags/:tag/posts
   *
   * Returns approved posts containing the given hashtag, paginated.
   *
   * Route param:
   *   tag   — hashtag name without '#'
   *
   * Query params:
   *   page  — 1-based page number (default 1)
   *   limit — results per page (default 10)
   */
  @Get('hashtags/:tag/posts')
  @HttpCode(HttpStatus.OK)
  getPostsByHashtag(
    @Param('tag') tag: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ): SocialFeedResponse {
    return this.socialService.getPostsByHashtag(tag, Number(page), Number(limit));
  }
}