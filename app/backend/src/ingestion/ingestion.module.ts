import { Module, forwardRef } from "@nestjs/common";

import { SupabaseModule } from "../supabase/supabase.module";
import { JobQueueModule } from "../job-queue/job-queue.module";
import { MetricsModule } from "../metrics/metrics.module";
import { AuditModule } from "../audit/audit.module";
import { CursorRepository } from "./cursor.repository";
import { EscrowEventRepository } from "./escrow-event.repository";
import { PrivacyEventRepository } from "./privacy-event.repository";
import { AdminEventRepository } from "./admin-event.repository";
import { StealthEventRepository } from "./stealth-event.repository";
import { IndexerCheckpointRepository } from "./indexer-checkpoint.repository";
import { SorobanEventParser } from "./soroban-event.parser";
import { StellarIngestionService } from "./stellar-ingestion.service";
import { SorobanEventIndexerService } from "./soroban-event-indexer.service";
import { SorobanIndexerController } from "./soroban-indexer.controller";
import { IngestionBootstrapService } from "./ingestion-bootstrap.service";
import { TestnetResetService } from "./testnet-reset.service";

@Module({
  imports: [
    SupabaseModule,
    forwardRef(() => JobQueueModule),
    MetricsModule,
    AuditModule,
  ],
  controllers: [SorobanIndexerController],
  providers: [
    CursorRepository,
    EscrowEventRepository,
    PrivacyEventRepository,
    AdminEventRepository,
    StealthEventRepository,
    IndexerCheckpointRepository,
    SorobanEventParser,
    StellarIngestionService,
    SorobanEventIndexerService,
    IngestionBootstrapService,
    TestnetResetService,
  ],
  exports: [
    StellarIngestionService,
    SorobanEventIndexerService,
    SorobanEventParser,
    CursorRepository,
    EscrowEventRepository,
    TestnetResetService,
  ],
})
export class IngestionModule {}
