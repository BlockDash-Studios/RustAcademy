import { Module } from '@nestjs/common';
import { FollowService } from './follow.service';
import { HashtagService } from './hashtag.service';
import { ShowcaseService } from './showcase.service';
import { SocialController } from './social.controller';

/** Social feed module (backlog area H). */
@Module({
  controllers: [SocialController],
  providers: [FollowService, ShowcaseService, HashtagService],
  exports: [FollowService, ShowcaseService, HashtagService],
})
export class SocialModule {}
