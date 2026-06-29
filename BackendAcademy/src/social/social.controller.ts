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
import {
  FollowResponse,
  SocialFeedResponse,
  SocialPost,
} from './interfaces/social-post.interface';
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
}