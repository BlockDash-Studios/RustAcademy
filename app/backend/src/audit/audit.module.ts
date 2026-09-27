import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';
import { AuditController } from './audit.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  // ApiKeysModule is imported so ApiKeyGuard (used to protect
  // AuditController's admin-only routes) can resolve ApiKeysService.
  imports: [SupabaseModule, ApiKeysModule],
  controllers: [AuditController],
  providers: [AuditService, AuditInterceptor],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
