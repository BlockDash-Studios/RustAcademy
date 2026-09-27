import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ModerationService } from './moderation.service';

@Module({
  controllers: [ChatController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ChatModule {}
