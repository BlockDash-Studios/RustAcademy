import { Module } from '@nestjs/common';
import { ChallengeService } from './challenge.service';
import { FollowService } from './follow.service';
import { HashtagService } from './hashtag.service';
import { ShowcaseService } from './showcase.service';
import { SocialController } from './social.controller';

/** Social feed module (backlog area H): follows, showcases, hashtags, challenges. */
@Module({
  controllers: [SocialController],
  providers: [FollowService, ShowcaseService, HashtagService, ChallengeService],
  exports: [FollowService, ShowcaseService, HashtagService, ChallengeService],
})
export class SocialModule {}
