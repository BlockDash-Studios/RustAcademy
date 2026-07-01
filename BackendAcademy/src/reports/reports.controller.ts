import { Controller, Get, Param, Query } from '@nestjs/common';
import { DailySummaryQueryDto } from './dto/daily-summary-query.dto';
import { DailySummaryReport, ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('daily-summaries/:userId')
  async getDailySummaries(
    @Param('userId') userId: string,
    @Query() query: DailySummaryQueryDto,
  ): Promise<DailySummaryReport> {
    return this.reportsService.getDailySummaryReport(
      userId,
      query.startDate,
      query.endDate,
      query.includeEmptyDays,
    );
  }
}
