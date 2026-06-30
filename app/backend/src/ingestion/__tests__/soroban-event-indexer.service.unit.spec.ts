import { EventEmitter2 } from "@nestjs/event-emitter";
import { SorobanEventIndexerService } from "../soroban-event-indexer.service";
import { IndexerCheckpointRepository } from "../indexer-checkpoint.repository";
import { EscrowEventRepository } from "../escrow-event.repository";
import { PrivacyEventRepository } from "../privacy-event.repository";
import { AdminEventRepository } from "../admin-event.repository";
import { StealthEventRepository } from "../stealth-event.repository";
import { MetricsService } from "../../metrics/metrics.service";
import { RawHorizonContractEvent } from "../soroban-event.parser";
import { xdr, nativeToScVal } from "@stellar/stellar-sdk";
import { AppConfigService } from "../../config";

const CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

function symVal(s: string) { return xdr.ScVal.scvSymbol(s); }
function addressVal(s: string) { return nativeToScVal(s); }
function bytesVal(hex: string) { return xdr.ScVal.scvBytes(Buffer.from(hex, "hex")); }
function mapVal(entries: Record<string, xdr.ScVal>) {
  return xdr.ScVal.scvMap(Object.entries(entries).map(([k, v]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: v })));
}

function makeEscrowDepositedRaw(ledger: number, pagingToken: string): RawHorizonContractEvent {
  const topics = [symVal("EscrowDeposited"), bytesVal("deadbeef".repeat(8)), addressVal("GDQERHRWJYV7JHRP5V7DWJVI6Y5ABZP3YRH7DKYJRBEGJQKE6IQEOSY2")];
  const data = mapVal({
    schema_version: nativeToScVal(2, { type: "u32" }),
    token: addressVal("CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"),
    amount: nativeToScVal(1_000n, { type: "i128" }),
    expires_at: nativeToScVal(9999999n, { type: "u64" }),
    timestamp: nativeToScVal(1700000000n, { type: "u64" }),
  });
  return {
    id: pagingToken,
    paging_token: pagingToken,
    transaction_hash: `tx-${pagingToken}`,
    ledger,
    created_at: "2026-01-01T00:00:00Z",
    contract_id: CONTRACT_ID,
    type: "contract",
    topic: topics.map((v) => v.toXDR("base64")),
    value: { xdr: data.toXDR("base64") },
  };
}

describe("SorobanEventIndexerService - Resiliency & Hardening", () => {
  let fetchSpy: jest.SpyInstance;
  let checkpointMap: Map<string, Record<string, unknown>>;

  const mockAppConfig = {
    network: "testnet",
  } as unknown as AppConfigService;

  const mocks = {
    config: mockAppConfig,
    checkpointRepo: {
      getCheckpoint: jest.fn(),
      saveCheckpoint: jest.fn(),
    } as unknown as IndexerCheckpointRepository,
    escrowRepo: { upsertEvent: jest.fn().mockResolvedValue(undefined) } as unknown as EscrowEventRepository,
    privacyRepo: { upsertEvent: jest.fn().mockResolvedValue(undefined) } as unknown as PrivacyEventRepository,
    adminRepo: { upsertEvent: jest.fn().mockResolvedValue(undefined) } as unknown as AdminEventRepository,
    stealthRepo: { upsertEvent: jest.fn().mockResolvedValue(undefined) } as unknown as StealthEventRepository,
    metrics: { recordUnknownSchemaVersion: jest.fn(), recordExternalCall: jest.fn(), recordError: jest.fn() } as unknown as MetricsService,
    eventEmitter: { emit: jest.fn() } as unknown as EventEmitter2,
  };

  let service: SorobanEventIndexerService;

  beforeEach(() => {
    checkpointMap = new Map();
    jest.clearAllMocks();
    
    (mocks.checkpointRepo.saveCheckpoint as jest.Mock).mockImplementation((cp: Record<string, unknown>) => {
      checkpointMap.set(`${cp.contractId}-${cp.mode}`, cp);
      return Promise.resolve();
    });

    (mocks.checkpointRepo.getCheckpoint as jest.Mock).mockImplementation((id: string, net: string, mode: string) => {
      return Promise.resolve(checkpointMap.get(`${id}-${mode}`) || null);
    });

    service = new SorobanEventIndexerService(
      mocks.config, mocks.checkpointRepo, mocks.escrowRepo,
      mocks.privacyRepo, mocks.adminRepo, mocks.stealthRepo,
      mocks.metrics, mocks.eventEmitter,
      {
        recordUnknownEvent: jest.fn(),
        recordFieldMismatch: jest.fn(),
        recordUnexpectedFields: jest.fn(),
        recordUnsupportedVersion: jest.fn(),
        recordIncompatibleVersion: jest.fn(),
        recordParseError: jest.fn(),
        getHealthSummary: jest.fn(),
      } as unknown as import("../schema-observability.service").SchemaObservabilityService
    );
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("should resume precisely from the cursor position without duplicate ingestion processing if a simulated crash occurs", async () => {
    const recordsPage1 = [makeEscrowDepositedRaw(100, "100-1")];
    
    fetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      redirected: false,
      statusText: "OK",
      type: "basic",
      url: "",
      clone: jest.fn(),
      body: null,
      bodyUsed: false,
      arrayBuffer: jest.fn(),
      blob: jest.fn(),
      formData: jest.fn(),
      text: jest.fn(),
      json: async () => ({
        _embedded: { records: recordsPage1 },
        _links: { next: { href: "https://horizon.stellar.org/contract_events?cursor=100-1" } },
      }),
    } as unknown as Response);

    await service.indexLedgerRange(CONTRACT_ID, 100, 105, undefined, false);

    expect(checkpointMap.get(`${CONTRACT_ID}-normal`)).toEqual({
      contractId: CONTRACT_ID,
      network: "testnet",
      mode: "normal",
      lastLedger: 100,
      pagingToken: "100-1",
    });

    const recordsPage2 = [makeEscrowDepositedRaw(101, "101-1")];
    fetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      redirected: false,
      statusText: "OK",
      type: "basic",
      url: "",
      clone: jest.fn(),
      body: null,
      bodyUsed: false,
      arrayBuffer: jest.fn(),
      blob: jest.fn(),
      formData: jest.fn(),
      text: jest.fn(),
      json: async () => ({
        _embedded: { records: recordsPage2 },
        _links: {},
      }),
    } as unknown as Response);

    const recoveryResult = await service.indexLedgerRange(CONTRACT_ID, 100, 105, undefined, false);
    expect(recoveryResult.processed).toBe(1);
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("cursor=100-1"), expect.anything());
  });

  it("should isolate separate isolated state updates when dual-read mechanisms are running", async () => {
    const prevContract = "CBFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFOG";
    const records = [makeEscrowDepositedRaw(100, "100-1")];

    fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      redirected: false,
      statusText: "OK",
      type: "basic",
      url: "",
      clone: jest.fn(),
      body: null,
      bodyUsed: false,
      arrayBuffer: jest.fn(),
      blob: jest.fn(),
      formData: jest.fn(),
      text: jest.fn(),
      json: async () => ({ _embedded: { records }, _links: {} }),
    } as unknown as Response);

    await service.indexLedgerRange(CONTRACT_ID, 100, 105, {
      previousContractId: prevContract,
      effectiveLedger: 102,
    }, false);

    expect(checkpointMap.has(`${prevContract}-dual-read-previous`)).toBe(true);
    expect(checkpointMap.has(`${CONTRACT_ID}-dual-read-current`)).toBe(true);
  });
});