import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  Header,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { ApiKeyGuard } from '../../../auth/guards/api-key.guard';
import { RequireScopes } from '../../../auth/decorators/require-scopes.decorator';
import { ApiKeyScope } from '../../../api-keys/api-keys.types';

@Controller('admin/audit')
@UseGuards(ApiKeyGuard)
export class AuditController {
  private readonly logger = new Logger(AuditController.name);

  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @RequireScopes(ApiKeyScope.ADMIN)
  async getLogs(@Query() query: QueryAuditLogsDto) {
    return this.auditService.findLogs(query);
  }

  @Get('export')
  @RequireScopes(ApiKeyScope.ADMIN)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename=audit-logs.csv')
  async exportLogs(@Query() query: QueryAuditLogsDto, @Res() res: Response) {
    // Export ignores pagination to get a full report for the filtered criteria
    const { data } = await this.auditService.findLogs({
      ...query,
      limit: 1000, // Reasonable cap for CSV export
      offset: 0,
    });

    const headers = ['ID', 'Timestamp', 'Actor', 'Action', 'Target', 'Request ID', 'Metadata'];
    const rows = (data || []).map((log: any) => [
      log.id,
      log.created_at,
      log.actor,
      log.action,
      log.target,
      log.request_id || '',
      JSON.stringify(log.metadata || {}).replace(/"/g, '""'),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any[]) => row.map(val => `"${val}"`).join(',')),
    ].join('\n');

    res.send(csvContent);
  }
}
