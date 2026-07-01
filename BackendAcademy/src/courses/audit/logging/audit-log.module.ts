import { Module } from '@nestjs/common';
import { AuditLogService } from '../audit.service';

@Module({
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
