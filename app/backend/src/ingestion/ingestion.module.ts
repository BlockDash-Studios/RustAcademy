import { Module, forwardRef } from "@nestjs/common";

import { SupabaseModule } from "../supabase/supabase.module";
import { JobQueueModule } from "../job-queue/job-queue.module";
import { MetricsModule } from "../metrics/metrics.module";
import { SentryModule } from "../sentry/sentry.module";
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
import { SchemaObservabilityService } from "./schema-observability.service";
import { ParserHealthController } from "./parser-health.controller";

@Module({
  imports: [
    SupabaseModule,
    forwardRef(() => JobQueueModule),
    MetricsModule,
    SentryModule,
  ],
  controllers: [SorobanIndexerController, ParserHealthController],
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
    SchemaObservabilityService,
  ],
  exports: [
    StellarIngestionService,
    SorobanEventIndexerService,
    SorobanEventParser,
    CursorRepository,
    EscrowEventRepository,
    SchemaObservabilityService,
  ],
})
export class IngestionModule {}
