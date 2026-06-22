/**
 * Tests for deterministic contract event replay metadata.
 *
 * Validates that:
 * 1. Duplicate event deliveries are handled idempotently via ON CONFLICT DO NOTHING.
 * 2. Out-of-order event deliveries are processed correctly using paging_token ordering.
 * 3. The `contractLedgerSequence` field enables cross-validation between the
 *    contract-reported ledger and the Horizon-reported ledger.
 * 4. Repository upserts are safe to call multiple times with the same event.
 */

import { xdr, nativeToScVal } from "@stellar/stellar-sdk";
import { SorobanEventParser, RawHorizonContractEvent } from "../soroban-event.parser";
import { RustAcademy_EVENT_SCHEMA_VERSION, RustAcademy_EVENT_TOPICS } from "../event-schema";
import type { EscrowDepositedEvent } from "../types/contract-event.types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function symVal(s: string): xdr.ScVal {
  return xdr.ScVal.scvSymbol(s);
}

function addressVal(pubkey: string): xdr.ScVal {
  return nativeToScVal(pubkey);
}

function bytesVal(hex: string): xdr.ScVal {
  return xdr.ScVal.scvBytes(Buffer.from(hex, "hex"));
}

function mapVal(entries: Record<string, xdr.ScVal>): xdr.ScVal {
  const mapEntries = Object.entries(entries).map(
    ([k, v]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: v }),
  );
  return xdr.ScVal.scvMap(mapEntries);
}

function makeEscrowDepositedRaw(
  ledger: number,
  pagingToken: string,
  txHash: string,
  contractLedger?: number,
): RawHorizonContractEvent {
  const topics = [
    symVal(RustAcademy_EVENT_TOPICS.escrow),
    symVal("EscrowDeposited"),
    bytesVal("deadbeef".repeat(8)),
    addressVal("GDQERHRWJYV7JHRP5V7DWJVI6Y5ABZP3YRH7DKYJRBEGJQKE6IQEOSY2"),
  ];
  const data = mapVal({
    amount_due: nativeToScVal(5_000_000n, { type: "i128" }),
    amount_paid: nativeToScVal(5_000_000n, { type: "i128" }),
    expires_at: nativeToScVal(1800000000n, { type: "u64" }),
    ledger_sequence: nativeToScVal(contractLedger ?? ledger, { type: "u32" }),
    schema_version: nativeToScVal(RustAcademy_EVENT_SCHEMA_VERSION, { type: "u32" }),
    timestamp: nativeToScVal(1700000000n, { type: "u64" }),
    token: addressVal("CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"),
  });
  return {
    id: pagingToken,
    paging_token: pagingToken,
    transaction_hash: txHash,
    ledger,
    created_at: "2026-01-01T00:00:00Z",
    contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    type: "contract",
    topic: topics.map((v) => v.toXDR("base64")),
    value: { xdr: data.toXDR("base64") },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Event Replay – Replay Metadata Extraction", () => {
  let parser: SorobanEventParser;

  beforeEach(() => {
    parser = new SorobanEventParser();
  });

  it("includes contractLedgerSequence in parsed event when ledger_sequence is present", () => {
    const raw = makeEscrowDepositedRaw(100, "100-1", "txabc", 100);
    const result = parser.parse(raw);

    expect(result).not.toBeNull();
    expect(result!.contractLedgerSequence).toBe(100);
    expect(result!.ledgerSequence).toBe(100);
  });

  it("contractLedgerSequence matches the paging_token ledger component for valid events", () => {
    const ledger = 250;
    const raw = makeEscrowDepositedRaw(ledger, `${ledger}-3`, "txdef", ledger);
    const result = parser.parse(raw);

    expect(result).not.toBeNull();
    expect(result!.contractLedgerSequence).toBe(ledger);
    expect(result!.ledgerSequence).toBe(ledger);
    // paging_token encodes {ledger}-{event_index}
    expect(result!.pagingToken.startsWith(String(ledger))).toBe(true);
  });

  it("deduplication key components are all present in the parsed event", () => {
    const raw = makeEscrowDepositedRaw(100, "100-2", "txghi", 100);
    const result = parser.parse(raw) as EscrowDepositedEvent | null;

    expect(result).not.toBeNull();
    // All three components of the stable dedup key must be populated
    expect(result!.txHash).toBe("txghi");
    expect(result!.pagingToken).toBe("100-2");
    expect(result!.contractLedgerSequence).toBeDefined();
  });
});

describe("Event Replay – Duplicate Delivery Detection", () => {
  let parser: SorobanEventParser;

  beforeEach(() => {
    parser = new SorobanEventParser();
  });

  it("parsing the same raw event twice produces identical output (idempotent parsing)", () => {
    const raw = makeEscrowDepositedRaw(100, "100-1", "tx-dup", 100);

    const first = parser.parse(raw);
    const second = parser.parse(raw);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    // Every field must be identical — deterministic parsing is the precondition
    // for safe database-level deduplication via ON CONFLICT DO NOTHING.
    expect(first!.txHash).toBe(second!.txHash);
    expect(first!.pagingToken).toBe(second!.pagingToken);
    expect(first!.ledgerSequence).toBe(second!.ledgerSequence);
    expect(first!.contractLedgerSequence).toBe(second!.contractLedgerSequence);
    expect(first!.contractTimestamp).toBe(second!.contractTimestamp);
    expect(first!.schemaVersion).toBe(second!.schemaVersion);
    expect(first!.eventType).toBe(second!.eventType);
  });

  it("same event with different paging_tokens (Horizon shard re-delivery) produces same identity fields", () => {
    // Simulate Horizon delivering the same on-chain event via two cursor paths.
    // The tx_hash and contract_ledger_sequence stay the same; paging_token may differ.
    const event1 = makeEscrowDepositedRaw(100, "100-1", "tx-same", 100);
    // Horizon re-delivery from a different shard cursor has the same ledger/tx but different token
    const event2 = { ...event1, paging_token: "100-1-alt" };

    const result1 = parser.parse(event1);
    const result2 = parser.parse(event2);

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();

    // Core identity (used by ON CONFLICT constraints) is identical
    expect(result1!.txHash).toBe(result2!.txHash);
    expect(result1!.contractLedgerSequence).toBe(result2!.contractLedgerSequence);
    expect(result1!.eventType).toBe(result2!.eventType);

    // The contract-reported ledger matches both (no mismatch)
    expect(result1!.contractLedgerSequence).toBe(100);
    expect(result2!.contractLedgerSequence).toBe(100);
  });

  it("repository upsert logic: ON CONFLICT columns cover all identity dimensions", () => {
    // Verify the deduplication key used by escrow-event.repository
    // includes tx_hash + commitment + event_type, all of which are derivable
    // from the parsed event.
    const raw = makeEscrowDepositedRaw(100, "100-1", "tx-repo", 100);
    const event = parser.parse(raw) as EscrowDepositedEvent | null;

    expect(event).not.toBeNull();
    expect(event!.txHash).toBeDefined();              // tx_hash
    expect(event!.commitment).toBeDefined();           // commitment (escrow_id)
    expect(event!.eventType).toBe("EscrowDeposited"); // event_type
    // bonus: contract-provided ledger for cross-validation
    expect(event!.contractLedgerSequence).toBe(100);
  });
});

describe("Event Replay – Out-of-Order Delivery", () => {
  let parser: SorobanEventParser;

  beforeEach(() => {
    parser = new SorobanEventParser();
  });

  it("processes events from a later ledger before an earlier ledger without errors", () => {
    // Simulate events arriving out of ledger order (ledger 105 before 100).
    const late = makeEscrowDepositedRaw(105, "105-1", "tx-late", 105);
    const early = makeEscrowDepositedRaw(100, "100-1", "tx-early", 100);

    const resultLate = parser.parse(late);
    const resultEarly = parser.parse(early);

    expect(resultLate).not.toBeNull();
    expect(resultEarly).not.toBeNull();

    // Each event carries its own ledger identity – they remain distinct
    expect(resultLate!.ledgerSequence).toBe(105);
    expect(resultLate!.contractLedgerSequence).toBe(105);
    expect(resultEarly!.ledgerSequence).toBe(100);
    expect(resultEarly!.contractLedgerSequence).toBe(100);
  });

  it("paging_token provides a stable total ordering for out-of-order events", () => {
    const events = [
      makeEscrowDepositedRaw(103, "103-1", "tx-103", 103),
      makeEscrowDepositedRaw(101, "101-2", "tx-101", 101),
      makeEscrowDepositedRaw(102, "102-1", "tx-102", 102),
    ];

    const parsed = events.map((e) => parser.parse(e)!);
    expect(parsed.every(Boolean)).toBe(true);

    // Sort by paging_token to recover ledger order
    const ordered = [...parsed].sort((a, b) =>
      a.pagingToken.localeCompare(b.pagingToken),
    );

    expect(ordered[0].ledgerSequence).toBe(101);
    expect(ordered[1].ledgerSequence).toBe(102);
    expect(ordered[2].ledgerSequence).toBe(103);
  });

  it("out-of-order events still carry valid contractLedgerSequence for cross-validation", () => {
    const outOfOrder = [
      makeEscrowDepositedRaw(200, "200-1", "tx-200", 200),
      makeEscrowDepositedRaw(150, "150-1", "tx-150", 150),
      makeEscrowDepositedRaw(175, "175-1", "tx-175", 175),
    ];

    for (const raw of outOfOrder) {
      const parsed = parser.parse(raw);
      expect(parsed).not.toBeNull();
      // Each event's contractLedgerSequence must match its own Horizon ledger
      expect(parsed!.contractLedgerSequence).toBe(parsed!.ledgerSequence);
    }
  });
});

describe("Event Replay – Idempotent Ingestion (Repository Layer)", () => {
  it("upsertEvent called twice with the same event calls the DB upsert twice but ON CONFLICT ensures single write", async () => {
    // Mock the supabase client to simulate ON CONFLICT DO NOTHING behavior.
    let insertCount = 0;
    const mockUpsert = jest.fn().mockImplementation(() => {
      insertCount++;
      // ON CONFLICT DO NOTHING: second call succeeds but inserts nothing
      return Promise.resolve({ error: null, data: null, count: insertCount === 1 ? 1 : 0 });
    });

    const mockClient = {
      from: jest.fn().mockReturnValue({ upsert: mockUpsert }),
    };

    // Import the repository dynamically to allow constructor injection
    const { EscrowEventRepository } = await import("../escrow-event.repository");
    const repo = new EscrowEventRepository({
      getClient: () => mockClient,
    } as never);

    const parser = new SorobanEventParser();
    const raw = makeEscrowDepositedRaw(100, "100-1", "tx-idem", 100);
    const event = parser.parse(raw) as EscrowDepositedEvent;
    expect(event).not.toBeNull();

    // First delivery
    await repo.upsertEvent(event);
    expect(mockUpsert).toHaveBeenCalledTimes(1);

    // Simulated duplicate delivery (same event, same paging_token)
    await repo.upsertEvent(event);
    expect(mockUpsert).toHaveBeenCalledTimes(2);

    // The upsert was always called with ignoreDuplicates: true
    expect(mockUpsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tx_hash: "tx-idem", event_type: "EscrowDeposited" }),
      expect.objectContaining({ ignoreDuplicates: true }),
    );
    expect(mockUpsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tx_hash: "tx-idem", event_type: "EscrowDeposited" }),
      expect.objectContaining({ ignoreDuplicates: true }),
    );
  });

  it("upsertEvent persists contract_ledger_sequence alongside tx_hash and paging_token", async () => {
    const capturedRow: Record<string, unknown>[] = [];
    const mockUpsert = jest.fn().mockImplementation((row: Record<string, unknown>) => {
      capturedRow.push(row);
      return Promise.resolve({ error: null });
    });

    const mockClient = {
      from: jest.fn().mockReturnValue({ upsert: mockUpsert }),
    };

    const { EscrowEventRepository } = await import("../escrow-event.repository");
    const repo = new EscrowEventRepository({
      getClient: () => mockClient,
    } as never);

    const parser = new SorobanEventParser();
    const raw = makeEscrowDepositedRaw(120, "120-2", "tx-meta", 120);
    const event = parser.parse(raw) as EscrowDepositedEvent;

    await repo.upsertEvent(event);

    expect(capturedRow[0]).toMatchObject({
      tx_hash: "tx-meta",
      ledger_sequence: 120,
      paging_token: "120-2",
      contract_ledger_sequence: 120,
      event_type: "EscrowDeposited",
    });
  });
});
