import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { ApiKeyGuard } from "../auth/guards/api-key.guard";
import { DailySummaryQueryDto } from "./dto/daily-summary-query.dto";
import { ReportsService } from "./reports.service";

@ApiTags("reports")
@UseGuards(ApiKeyGuard)
@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("daily-summaries")
  @ApiOperation({
    summary: "Fetch daily activity summaries and progress for a wallet",
  })
  @ApiResponse({
    status: 200,
    description: "Daily activity summaries generated successfully",
  })
  async getDailySummaries(
    @Req() req: Request,
    @Query() query: DailySummaryQueryDto,
  ) {
    return this.reportsService.getDailySummaryReport(
      query.publicKey,
      query.startDate,
      query.endDate,
      query.includeEmptyDays,
      req.organizationContext?.organizationId,
    );
  }
}
