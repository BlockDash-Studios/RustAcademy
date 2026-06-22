import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AppConfigModule } from '../config/config.module';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';
import { NetworkSafetyGuard } from './network-safety.guard';
import { ContractWritePolicyService } from './contract-write-policy.service';

@Module({
  imports: [SupabaseModule, AuditModule, AppConfigModule],
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService, NetworkSafetyGuard, ContractWritePolicyService],
  exports: [FeatureFlagsService, NetworkSafetyGuard, ContractWritePolicyService],
})
export class FeatureFlagsModule {}
