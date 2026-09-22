import { Module } from "@nestjs/common";
import { HorizonService } from "../transactions/horizon.service";
import { SupabaseModule } from "../supabase/supabase.module";
import { PaymentsController } from "./payments.controller";
import { AuditModule } from "../audit/audit.module";
import { PaymentsService } from "./payments.service";
import { PayoutRepository } from "./payout.repository";

@Module({
  imports: [AuditModule, SupabaseModule],
  controllers: [PaymentsController],
  providers: [HorizonService, PaymentsService, PayoutRepository],
  exports: [],
})
export class PaymentsModule {}
