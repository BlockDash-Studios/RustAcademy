import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import { SupabaseModule } from "../supabase/supabase.module";
import { StellarModule } from "../stellar/stellar.module";
import { JobQueueModule } from "../job-queue/job-queue.module";
import { TransactionsModule } from "../transactions/transactions.module";

@Module({
  imports: [
    SupabaseModule,
    StellarModule,
    JobQueueModule,
    TransactionsModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
