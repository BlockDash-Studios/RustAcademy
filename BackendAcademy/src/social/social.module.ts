import { Module } from '@nestjs/common';
import { FollowService } from './follow.service';
import { SocialController } from './social.controller';

/** Social feed module (backlog area H). */
@Module({
  controllers: [SocialController],
  providers: [FollowService],
  exports: [FollowService],
})
export class SocialModule {}
