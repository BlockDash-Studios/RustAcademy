import { Module } from "@nestjs/common";
import { TransactionsController } from "./transactions.controller";
import { HorizonService } from "./horizon.service";
import { AppConfigModule } from "../config";
import { TransactionsService } from "./transaction.service";
import { SorobanRpcService } from "./soroban-rpc.service";
import { ApiKeysModule } from "../api-keys/api-keys.module";
import { ApiKeyGuard } from "../auth/guards/api-key.guard";
import { MetricsModule } from "../metrics/metrics.module";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { SupabaseModule } from "../supabase/supabase.module";
import { InvocationReplayService } from "./invocation-replay.service";

@Module({
  imports: [AppConfigModule, ApiKeysModule, MetricsModule, FeatureFlagsModule, SupabaseModule],
  controllers: [TransactionsController],
  providers: [
    HorizonService,
    TransactionsService,
    SorobanRpcService,
    ApiKeyGuard,
    InvocationReplayService,
  ],
  exports: [HorizonService, TransactionsService, SorobanRpcService],
})
export class TransactionsModule {}
