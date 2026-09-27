import { Controller, Get, Query, Res, Delete, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './audit.model';
import { Response } from 'express';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { SensitiveMutation } from '../auth/decorators/sensitive-mutation.decorator';

// Issue #551: this controller reads and can permanently delete the audit
// trail, so every route requires the "admin" API key scope. Note that
// ApiKeyGuard treats a request with no key at all as public (see its own
// tests) — put this controller behind network-level access control too if
// that's not acceptable for your deployment (see docs/RATE-LIMITING-AND-AUDIT.md).
@Controller('admin/audit')
@UseGuards(ApiKeyGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // Admin endpoint to query logs with filters and pagination
  @Get()
  @RequireScopes('admin')
  queryLogs(@Query() query: QueryAuditLogsDto) {
    return this.auditService.query(query);
  }

  // Export capability (CSV)
  @Get('export')
  @RequireScopes('admin')
  async exportCsv(@Res() res: Response) {
    const csv = await this.auditService.exportCsv();
    res.header('Content-Type', 'text/csv');
    res.attachment('audit-logs.csv');
    return res.send(csv);
  }

  // Manual trigger for retention strategy (could also be a cron job).
  // Destructive and irreversible — sensitive-tagged and audited like any
  // other admin mutation, on top of the "admin" scope requirement above.
  @Delete('retention')
  @RequireScopes('admin')
  @SensitiveMutation('audit.retention.apply')
  applyRetentionStrategy() {
    // Defaulting to 90 days retention policy
    return this.auditService.applyRetention(90);
  }
}
