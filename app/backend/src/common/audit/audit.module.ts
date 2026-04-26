import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { SupabaseModule } from '../../supabase/supabase.module';
import { ApiKeysModule } from '../../api-keys/api-keys.module';

@Global()
@Module({
  imports: [SupabaseModule, ApiKeysModule],
  providers: [AuditService],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
