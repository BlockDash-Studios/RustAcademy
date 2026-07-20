import { AppConfigService } from "../../config";
import { ContractRegistryService } from "../../contracts/contract-registry.service";
import { IngestionBootstrapService } from "../ingestion-bootstrap.service";
import { StellarIngestionService } from "../stellar-ingestion.service";

describe("IngestionBootstrapService", () => {
  let service: IngestionBootstrapService;
  let config: jest.Mocked<Partial<AppConfigService>>;
  let ingestion: jest.Mocked<Partial<StellarIngestionService>>;
  let registry: jest.Mocked<Partial<ContractRegistryService>>;

  beforeEach(() => {
    config = {
      ingestionEnabled: true,
      RustAcademyContractId: "CCURRENT",
    };

    ingestion = {
      startStreaming: jest.fn().mockResolvedValue(undefined),
      startStreamingWithDualRead: jest.fn().mockResolvedValue(undefined),
    };

    registry = {
      getValidatedIngestionRegistration: jest.fn().mockResolvedValue({
        contractId: "CCURRENT",
        eventSchemaVersion: 2,
      }),
    };

    service = new IngestionBootstrapService(
      config as AppConfigService,
      ingestion as StellarIngestionService,
      registry as ContractRegistryService,
    );
  });

  it("does not start ingestion when the explicit boot gate is disabled", async () => {
    config.ingestionEnabled = false;

    await service.onModuleInit();

    expect(registry.getValidatedIngestionRegistration).not.toHaveBeenCalled();
    expect(ingestion.startStreaming).not.toHaveBeenCalled();
  });

  it("starts single-read ingestion after registry validation", async () => {
    await service.onModuleInit();

    expect(registry.getValidatedIngestionRegistration).toHaveBeenCalledWith(
      "RustAcademy",
      "CCURRENT",
      2,
    );
    expect(ingestion.startStreaming).toHaveBeenCalledWith("CCURRENT");
    expect(ingestion.startStreamingWithDualRead).not.toHaveBeenCalled();
  });

  it("starts dual-read ingestion when the registry marks a transition window", async () => {
    registry.getValidatedIngestionRegistration!.mockResolvedValue({
      contractId: "CCURRENT",
      previousContractId: "CPREV",
      effectiveLedger: 456,
      eventSchemaVersion: 2,
    });

    await service.onModuleInit();

    expect(ingestion.startStreamingWithDualRead).toHaveBeenCalledWith({
      contractId: "CCURRENT",
      previousContractId: "CPREV",
      effectiveLedger: 456,
    });
    expect(ingestion.startStreaming).not.toHaveBeenCalled();
  });

  it("fails fast when ingestion is enabled without a configured contract id", async () => {
    config.RustAcademyContractId = undefined;

    await expect(service.onModuleInit()).rejects.toThrow(
      "INGESTION_ENABLED is true but RustAcademy_CONTRACT_ID is not configured.",
    );
  });

  it("fails fast when registry validation rejects the configured contract", async () => {
    registry.getValidatedIngestionRegistration!.mockRejectedValue(
      new Error("registry mismatch"),
    );

    await expect(service.onModuleInit()).rejects.toThrow("registry mismatch");
    expect(ingestion.startStreaming).not.toHaveBeenCalled();
  });
});
