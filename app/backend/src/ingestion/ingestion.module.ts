import { Module, forwardRef } from "@nestjs/common";

import { SupabaseModule } from "../supabase/supabase.module";
import { JobQueueModule } from "../job-queue/job-queue.module";
import { MetricsModule } from "../metrics/metrics.module";
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
import { ContractEventDriftService } from "./contract-event-drift.service";
import { MetricsService } from "../metrics/metrics.service";

@Module({
  imports: [
    SupabaseModule,
    forwardRef(() => JobQueueModule),
    MetricsModule,
  ],
  controllers: [SorobanIndexerController],
  providers: [
    CursorRepository,
    EscrowEventRepository,
    PrivacyEventRepository,
    AdminEventRepository,
    StealthEventRepository,
    IndexerCheckpointRepository,
    ContractEventDriftService,
    /**
     * Custom factory provider for SorobanEventParser so we can wire
     * the onUnknownSchemaVersion callback (which needs MetricsService)
     * alongside the ContractEventDriftService at module bootstrap time.
     */
    {
      provide: SorobanEventParser,
      useFactory: (
        metrics: MetricsService,
        driftService: ContractEventDriftService,
      ) =>
        new SorobanEventParser(
          (eventName, version) => {
            metrics.recordUnknownSchemaVersion(eventName, version);
          },
          driftService,
        ),
      inject: [MetricsService, ContractEventDriftService],
    },
    StellarIngestionService,
    SorobanEventIndexerService,
    IngestionBootstrapService,
  ],
  exports: [
    StellarIngestionService,
    SorobanEventIndexerService,
    SorobanEventParser,
    CursorRepository,
    EscrowEventRepository,
    ContractEventDriftService,
  ],
})
export class IngestionModule {}
