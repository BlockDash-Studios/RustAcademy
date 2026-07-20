import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { AppConfigService } from "../config";
import { RustAcademy_EVENT_SCHEMA_VERSION } from "./event-schema";
import { StellarIngestionService } from "./stellar-ingestion.service";
import { ContractRegistryService } from "../contracts/contract-registry.service";

/**
 * Reads the  RustAcademy_CONTRACT_ID environment variable and starts streaming
 * once the NestJS application is ready, with optional dual-read support.
 *
 * If no contract ID is configured the service logs a warning and skips.
 */
@Injectable()
export class IngestionBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(IngestionBootstrapService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly ingestion: StellarIngestionService,
    private readonly registry: ContractRegistryService,
  ) {}

  async onModuleInit(): Promise<void> {
    const contractId = this.config.RustAcademyContractId;

    if (!this.config.ingestionEnabled) {
      this.logger.warn(
        "INGESTION_ENABLED is false; automatic Stellar ingestion bootstrap is disabled.",
      );
      return;
    }

    if (!contractId) {
      throw new Error(
        "INGESTION_ENABLED is true but RustAcademy_CONTRACT_ID is not configured.",
      );
    }

    this.logger.log(`Validating ingestion startup for contract ${contractId}`);

    const registration = await this.registry.getValidatedIngestionRegistration(
      "RustAcademy",
      contractId,
      RustAcademy_EVENT_SCHEMA_VERSION,
    );

    this.logger.log(
      `Starting Stellar ingestion for contract ${registration.contractId} with schema v${registration.eventSchemaVersion}`,
    );

    if (registration.previousContractId) {
      this.logger.log(
        `Contract registry dual-read is active; starting previous contract stream ${registration.previousContractId}`,
      );
      await this.ingestion.startStreamingWithDualRead({
        contractId: registration.contractId,
        previousContractId: registration.previousContractId,
        effectiveLedger: registration.effectiveLedger,
      });
      return;
    }

    await this.ingestion.startStreaming(registration.contractId);
  }
}
