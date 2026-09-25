import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ChallengeService } from './challenge.service';
import {
  CreateChallengeDto,
  SubmitChallengeDto,
  VoteDto,
} from './dto/challenge.dto';
import { CreateShowcaseDto } from './dto/create-showcase.dto';
import { FollowDto } from './dto/follow.dto';
import { IndexPostDto } from './dto/index-post.dto';
import { ReportContentDto } from './dto/report-content.dto';
import { ContentModerationService } from './content-moderation.service';
import { FollowService } from './follow.service';
import { HashtagService } from './hashtag.service';
import { ShowcaseService } from './showcase.service';
import { ModerationTargetKind } from './social.types';

/** REST surface for the social feed (backlog area H). */
@Controller('social')
export class SocialController {
  constructor(
    private readonly followService: FollowService,
    private readonly showcaseService: ShowcaseService,
    private readonly hashtagService: HashtagService,
    private readonly challengeService: ChallengeService,
    private readonly contentModeration: ContentModerationService,
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
    const items = this.contentModeration.filterVisible(
      'post',
      this.followService.getFeed(userId),
      (item) => item.itemId,
    );
    return { userId, items };
  }

  // ── Showcase posts (BE-089) ─────────────────────────────────────────────

  @Post('showcases')
  createShowcase(@Body() dto: CreateShowcaseDto) {
    return this.showcaseService.create(dto);
  }

  @Get('users/:userId/showcases')
  listShowcases(@Param('userId') userId: string) {
    const showcases = this.contentModeration.filterVisible(
      'post',
      this.showcaseService.listByAuthor(userId),
      (post) => post.itemId,
    );
    return { userId, showcases };
  }

  // ── Hashtags and trending (BE-090) ──────────────────────────────────────

  @Post('hashtags/index')
  indexPost(@Body() dto: IndexPostDto) {
    return { postId: dto.postId, tags: this.hashtagService.indexPost(dto.postId, dto.text) };
  }

  @Get('hashtags/trending')
  getTrending(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return { trending: this.hashtagService.getTrending(limit ?? 5) };
  }

  @Get('hashtags/:tag/posts')
  getTaggedPosts(@Param('tag') tag: string) {
    const postIds = this.contentModeration.filterVisible(
      'post',
      this.hashtagService.getPosts(tag),
      (postId) => postId,
    );
    return { tag, postIds };
  }

  // ── Weekly challenges (BE-091) ──────────────────────────────────────────

  @Post('challenges')
  createChallenge(@Body() dto: CreateChallengeDto) {
    const challenge = this.challengeService.create({
      challengeId: dto.challengeId,
      title: dto.title,
      potStroops: BigInt(dto.potStroops),
    });
    // bigint is not JSON-serialisable, so the wire form is a string.
    return { ...challenge, potStroops: challenge.potStroops.toString() };
  }

  @Post('challenges/:challengeId/submissions')
  submitToChallenge(
    @Param('challengeId') challengeId: string,
    @Body() dto: SubmitChallengeDto,
  ) {
    return this.challengeService.submit(challengeId, dto);
  }

  @Post('challenges/:challengeId/voting')
  @HttpCode(200)
  openVoting(@Param('challengeId') challengeId: string) {
    const challenge = this.challengeService.openVoting(challengeId);
    return { ...challenge, potStroops: challenge.potStroops.toString() };
  }

  @Post('challenges/:challengeId/votes')
  @HttpCode(200)
  vote(@Param('challengeId') challengeId: string, @Body() dto: VoteDto) {
    this.challengeService.vote(challengeId, dto);
    return { tally: this.challengeService.getTally(challengeId) };
  }

  @Post('challenges/:challengeId/close')
  @HttpCode(200)
  closeChallenge(@Param('challengeId') challengeId: string) {
    const { challenge, payout } = this.challengeService.close(challengeId);
    return {
      challenge: { ...challenge, potStroops: challenge.potStroops.toString() },
      payout: {
        ...payout,
        awards: Object.fromEntries(
          Object.entries(payout.awards).map(([id, stroops]) => [id, stroops.toString()]),
        ),
      },
    };
  }

  @Get('challenges/:challengeId')
  getChallenge(@Param('challengeId') challengeId: string) {
    const challenge = this.challengeService.get(challengeId);
    return {
      ...challenge,
      potStroops: challenge.potStroops.toString(),
      submissions: this.challengeService.getSubmissions(challengeId),
      tally: this.challengeService.getTally(challengeId),
    };
  }

  // ── Content moderation (BE-093) ─────────────────────────────────────────

  /** Flags a post or comment; the target is hidden pending review. */
  @Post('reports')
  reportContent(@Body() dto: ReportContentDto) {
    return this.contentModeration.report(dto);
  }

  @Get('moderation/queue')
  getModerationQueue() {
    return { reports: this.contentModeration.getQueue() };
  }

  /**
   * The append-only moderation audit trail.
   *
   * Filtering by target is offered because the trail is otherwise shared by
   * every moderated post and comment in the feed.
   */
  @Get('moderation/audit')
  getModerationAudit(
    @Query('targetKind') targetKind?: ModerationTargetKind,
    @Query('targetId') targetId?: string,
  ) {
    return { entries: this.contentModeration.getAuditTrail({ targetKind, targetId }) };
  }
}

