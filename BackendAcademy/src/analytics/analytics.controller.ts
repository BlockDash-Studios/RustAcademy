import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UsePipes,
} from '@nestjs/common';
import { AnalyticsService, EventType } from './analytics.service';
import { AnalyticsEvent } from './analytics.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { ValidationPipe, ValidationSchema } from '../common/validation.middleware';

const analyticsEventSchema: ValidationSchema = {
  required: ['eventType'],
  properties: {
    eventType: { type: 'string', enum: Object.values(EventType) },
    userId: { type: 'string' },
    sessionId: { type: 'string' },
    properties: { type: 'object' },
    ipAddress: { type: 'string' },
    userAgent: { type: 'string' },
  },
};

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('track')
  @UsePipes(new ValidationPipe(analyticsEventSchema))
  async trackEvent(@Body() dto: CreateEventDto): Promise<AnalyticsEvent> {
    return this.analyticsService.trackEvent(dto);
  }

  @Get('events/user/:userId')
  async getUserEvents(@Param('userId') userId: string): Promise<AnalyticsEvent[]> {
    return this.analyticsService.getEventsByUserId(userId);
  }

  @Get('events/type/:eventType')
  async getEventsByType(@Param('eventType') eventType: string): Promise<AnalyticsEvent[]> {
    return this.analyticsService.getEventsByType(eventType);
  }

  @Get('events')
  async getEventsByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<AnalyticsEvent[]> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return this.analyticsService.getEventsByDateRange(start, end);
  }

  @Get('statistics')
  async getStatistics() {
    return this.analyticsService.getEventStatistics();
  }

  @Get('events/all')
  async getAllEvents(@Query('limit', ParseIntPipe) limit?: number): Promise<AnalyticsEvent[]> {
    return this.analyticsService.getAllEvents(limit);
  }

  @Delete('events/:id')
  async deleteEvent(@Param('id') id: string): Promise<{ success: boolean }> {
    const success = await this.analyticsService.deleteEvent(id);
    return { success };
  }

  @Delete('events/cleanup')
  async cleanupOldEvents(
    @Query('days', ParseIntPipe) days: number = 30,
  ): Promise<{ deletedCount: number }> {
    const deletedCount = await this.analyticsService.clearOldEvents(days);
    return { deletedCount };
  }
}