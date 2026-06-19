import { Controller, Get, Post, Req, Query, Param } from '@nestjs/common';
import { InAppNotificationRepository } from './in-app-notification.repository';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly inAppRepo: InAppNotificationRepository) {}

  @Get('in-app')
  getInApp(
    @Req() req,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    return this.inAppRepo.findByUser(req.user.publicKey, parsedLimit, cursor);
  }
  
  @Post('in-app/:id/read')
  markRead(@Param('id') id: string) {
    return this.inAppRepo.markAsRead(id);
  }
  
  @Post('in-app/read-all')
  markAll(@Req() req) {
    return this.inAppRepo.markAllAsRead(req.user.publicKey);
  }
}