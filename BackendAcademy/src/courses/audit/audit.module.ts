import { Module } from '@nestjs/common';
import { AuditLogModule } from './logging/audit-log.module';

@Module({
  imports: [
    AuditLogModule,
  ],
})
export class AppModule {}