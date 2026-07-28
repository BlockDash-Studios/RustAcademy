import { Controller, Get, Post, Body, Query, Patch } from '@nestjs/common';
import { NotificationsService, BatchDeliveryResult } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-preferences.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  create(@Body() createNotificationDto: CreateNotificationDto) {
    return this.notificationsService.create(createNotificationDto);
  }

  @Get()
  findAll() {
    return this.notificationsService.findAll();
  }

  @Get('user')
  findByUserId(@Query('userId') userId: string) {
    return this.notificationsService.findByUserId(userId);
  }

  @Get('preferences')
  getPreferences(@Query('userId') userId: string) {
    return this.notificationsService.getPreferences(userId);
  }

  @Patch('preferences')
  upsertPreferences(
    @Query('userId') userId: string,
    @Body() updateDto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationsService.upsertPreferences(userId, updateDto);
  }

  // ── Batch & provider endpoints (#386, #388) ───────────────

  /**
   * Returns the current batch configuration.
   */
  @Get('batch/config')
  getBatchConfig() {
    return this.notificationsService.getBatchConfig();
  }

  /**
   * Returns the count of pending batched notifications.
   */
  @Get('batch/pending')
  getPendingBatchCount() {
    return { pending: this.notificationsService.getPendingBatchCount() };
  }

  /**
   * Forces a flush of all pending batched notifications.
   */
  @Post('batch/flush')
  async flushBatch(): Promise<BatchDeliveryResult> {
    return this.notificationsService.flushBatch();
  }

  /**
   * Returns the health status of all notification providers.
   */
  @Get('providers/health')
  async checkProvidersHealth() {
    return { providers: await this.notificationsService.checkProvidersHealth() };
  }
}
