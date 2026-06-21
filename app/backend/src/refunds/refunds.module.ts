import { Module } from "@nestjs/common";
import { RefundsService } from "./refunds.service";
import { RefundsController } from "./refunds.controller";
import { SupabaseModule } from "../supabase/supabase.module";
import { ApiKeysModule } from "../api-keys/api-keys.module";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { AuditModule } from "../audit/audit.module";
import { AppConfigModule } from "../config";
import { JobQueueModule } from "../job-queue/job-queue.module";

@Module({
  imports: [SupabaseModule, ApiKeysModule, FeatureFlagsModule, AuditModule, AppConfigModule, JobQueueModule],
  providers: [RefundsService],
  controllers: [RefundsController],
  exports: [RefundsService],
})
export class RefundsModule {}
