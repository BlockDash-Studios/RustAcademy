import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ModerationService } from './moderation.service';
import { ReportMessageDto } from './dto/report-message.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('chat')
@Controller('v1/chat')
export class ChatController {
  constructor(private readonly moderation: ModerationService) {}

  @Post('messages')
  sendMessage(@Body() message: SendMessageDto) {
    return this.moderation.sendMessage(message);
  }

  @Post('reports')
  report(@Body() report: ReportMessageDto) {
    return this.moderation.report(report);
  }

  @Get('moderation/queue')
  queue() {
    return this.moderation.getQueue();
  }
}
