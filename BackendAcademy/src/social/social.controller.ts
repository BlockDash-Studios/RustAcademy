import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CreateShowcaseDto } from './dto/create-showcase.dto';
import { FollowDto } from './dto/follow.dto';
import { FollowService } from './follow.service';
import { ShowcaseService } from './showcase.service';

/** REST surface for the social feed (backlog area H). */
@Controller('social')
export class SocialController {
  constructor(
    private readonly followService: FollowService,
    private readonly showcaseService: ShowcaseService,
  ) {}

  // ── Follow graph (BE-088) ───────────────────────────────────────────────

  @Post('follows')
  follow(@Body() dto: FollowDto) {
    return this.followService.follow(dto.followerId, dto.followeeId);
  }

  @Delete('follows')
  @HttpCode(200)
  unfollow(@Body() dto: FollowDto) {
    return { removed: this.followService.unfollow(dto.followerId, dto.followeeId) };
  }

  @Get('users/:userId/following')
  getFollowing(@Param('userId') userId: string) {
    return { userId, following: this.followService.getFollowing(userId) };
  }

  @Get('users/:userId/followers')
  getFollowers(@Param('userId') userId: string) {
    return { userId, followers: this.followService.getFollowers(userId) };
  }

  @Get('users/:userId/follow-counts')
  getCounts(@Param('userId') userId: string) {
    return { userId, ...this.followService.getCounts(userId) };
  }

  @Get('users/:userId/feed')
  getFeed(@Param('userId') userId: string) {
    return { userId, items: this.followService.getFeed(userId) };
  }

  // ── Showcase posts (BE-089) ─────────────────────────────────────────────

  @Post('showcases')
  createShowcase(@Body() dto: CreateShowcaseDto) {
    return this.showcaseService.create(dto);
  }

  @Get('users/:userId/showcases')
  listShowcases(@Param('userId') userId: string) {
    return { userId, showcases: this.showcaseService.listByAuthor(userId) };
  }
}
