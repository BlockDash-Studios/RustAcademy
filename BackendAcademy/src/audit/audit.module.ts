import { Module } from '@nestjs/common';
import { AuditLogModule } from './logging/audit-log.module';
import { AuditController } from './audit.controller';

@Module({
  imports: [
    AuditLogModule,
  ],
  controllers: [AuditController],
  exports: [AuditLogModule]
})
export class AuditModule {}
