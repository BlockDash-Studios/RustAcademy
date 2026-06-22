import { xdr, nativeToScVal } from "@stellar/stellar-sdk";
import {
  SorobanEventParser,
  RawHorizonContractEvent,
} from "../soroban-event.parser";
import {
  RustAcademy_EVENT_SCHEMA_CONTRACTS,
  RustAcademy_EVENT_SCHEMA_VERSION,
  RustAcademy_EVENT_TOPICS,
} from "../event-schema";

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

function makeRaw(
  topics: xdr.ScVal[],
  data: xdr.ScVal,
  overrides: Partial<RawHorizonContractEvent> = {},
): RawHorizonContractEvent {
  return {
    id: "1",
    paging_token: "100-1",
    transaction_hash: "txhash1",
    ledger: 100,
    created_at: "2025-01-01T00:00:00Z",
    contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    type: "contract",
    topic: topics.map((v) => v.toXDR("base64")),
    value: { xdr: data.toXDR("base64") },
    ...overrides,
  };
}

const OWNER = "GDQERHRWJYV7JHRP5V7DWJVI6Y5ABZP3YRH7DKYJRBEGJQKE6IQEOSY2";
const TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const COMMITMENT_HEX = "deadbeef".repeat(8);

describe("SorobanEventParser", () => {
  let parser: SorobanEventParser;

  beforeEach(() => {
    parser = new SorobanEventParser();
  });

  describe("EscrowDeposited", () => {
    it("parses canonical testnet topics with schema versioned payload", () => {
      const topics = [
        symVal(RustAcademy_EVENT_TOPICS.escrow),
        symVal("EscrowDeposited"),
        bytesVal(COMMITMENT_HEX),
        addressVal(OWNER),
      ];
      const data = mapVal({
        amount_due: nativeToScVal(5_000_000n, { type: "i128" }),
        amount_paid: nativeToScVal(2_500_000n, { type: "i128" }),
        expires_at: nativeToScVal(1800000000n, { type: "u64" }),
        schema_version: nativeToScVal(RustAcademy_EVENT_SCHEMA_VERSION, {
          type: "u32",
        }),
        timestamp: nativeToScVal(1700000000n, { type: "u64" }),
        token: addressVal(TOKEN),
      });

      const result = parser.parse(makeRaw(topics, data));

      expect(result?.eventType).toBe("EscrowDeposited");
      if (result?.eventType !== "EscrowDeposited") return;
      expect(result.topicNamespace).toBe(RustAcademy_EVENT_TOPICS.escrow);
      expect(result.schemaVersion).toBe(RustAcademy_EVENT_SCHEMA_VERSION);
      expect(result.commitment).toBe(COMMITMENT_HEX);
      expect(result.owner).toBe(OWNER);
      expect(result.amount).toBe(5_000_000n);
      expect(result.amountPaid).toBe(2_500_000n);
      expect(result.expiresAt).toBe(1800000000n);
      expect(result.contractTimestamp).toBe(1700000000n);
    });

    it("parses a valid EscrowDeposited event", () => {
      const topics = [
        symVal("EscrowDeposited"),
        bytesVal(COMMITMENT_HEX),
        addressVal(OWNER),
      ];
      const data = mapVal({
        token: addressVal(TOKEN),
        amount: nativeToScVal(5_000_000n, { type: "i128" }),
        expires_at: nativeToScVal(1800000000n, { type: "u64" }),
        timestamp: nativeToScVal(1700000000n, { type: "u64" }),
      });

      const result = parser.parse(makeRaw(topics, data));
      expect(result?.eventType).toBe("EscrowDeposited");
      if (result?.eventType !== "EscrowDeposited") return;
      expect(result.commitment).toBe(COMMITMENT_HEX);
      expect(result.owner).toBe(OWNER);
      expect(result.schemaVersion).toBe(1);
      expect(result.topicNamespace).toBe("LEGACY");
      expect(result.amount).toBe(5_000_000n);
      expect(result.amountPaid).toBe(5_000_000n);
      expect(result.expiresAt).toBe(1800000000n);
      expect(result.contractTimestamp).toBe(1700000000n);
    });
  });

  describe("EscrowWithdrawn", () => {
    it("parses a valid EscrowWithdrawn event", () => {
      const topics = [
        symVal("EscrowWithdrawn"),
        bytesVal(COMMITMENT_HEX),
        addressVal(OWNER),
      ];
      const data = mapVal({
        token: addressVal(TOKEN),
        amount: nativeToScVal(5_000_000n, { type: "i128" }),
        timestamp: nativeToScVal(1700001000n, { type: "u64" }),
      });
      const result = parser.parse(makeRaw(topics, data));
      expect(result?.eventType).toBe("EscrowWithdrawn");
    });
  });

  describe("EscrowRefunded", () => {
    it("parses a valid EscrowRefunded event", () => {
      const topics = [
        symVal("EscrowRefunded"),
        bytesVal(COMMITMENT_HEX),
        addressVal(OWNER),
      ];
      const data = mapVal({
        token: addressVal(TOKEN),
        amount: nativeToScVal(5_000_000n, { type: "i128" }),
        timestamp: nativeToScVal(1700002000n, { type: "u64" }),
      });
      const result = parser.parse(makeRaw(topics, data));
      expect(result?.eventType).toBe("EscrowRefunded");
    });
  });

  describe("PrivacyToggled", () => {
    it("parses a valid PrivacyToggled event", () => {
      const topics = [symVal("PrivacyToggled"), addressVal(OWNER)];
      const data = mapVal({
        enabled: nativeToScVal(true),
        timestamp: nativeToScVal(1700003000n, { type: "u64" }),
      });
      const result = parser.parse(makeRaw(topics, data));
      expect(result?.eventType).toBe("PrivacyToggled");
      if (result?.eventType !== "PrivacyToggled") return;
      expect(result.enabled).toBe(true);
      expect(result.owner).toBe(OWNER);
    });
  });

  describe("AdminChanged", () => {
    it("parses a valid AdminChanged event", () => {
      const ADMIN2 = "GB7QNDHSBQZENWGZUBJ4KLSZFRNHN5ATQXZSC3ZHZ5ZBQ6Y6X3TOBQ7S";
      const topics = [
        symVal("AdminChanged"),
        addressVal(OWNER),
        addressVal(ADMIN2),
      ];
      const data = mapVal({
        timestamp: nativeToScVal(1700004000n, { type: "u64" }),
      });
      const result = parser.parse(makeRaw(topics, data));
      expect(result?.eventType).toBe("AdminChanged");
      if (result?.eventType !== "AdminChanged") return;
      expect(result.oldAdmin).toBe(OWNER);
      expect(result.newAdmin).toBe(ADMIN2);
    });
  });

  describe("error cases", () => {
    it("returns null for an event with no topics", () => {
      expect(parser.parse(makeRaw([], xdr.ScVal.scvVoid()))).toBeNull();
    });

    it("returns null for an unrecognised event name", () => {
      expect(
        parser.parse(makeRaw([symVal("UnknownEvent")], xdr.ScVal.scvVoid())),
      ).toBeNull();
    });

    it("returns null for unsupported schema versions", () => {
      const topics = [
        symVal(RustAcademy_EVENT_TOPICS.privacy),
        symVal("PrivacyToggled"),
        addressVal(OWNER),
      ];
      const data = mapVal({
        enabled: nativeToScVal(true),
        schema_version: nativeToScVal(999, { type: "u32" }),
        timestamp: nativeToScVal(1700003000n, { type: "u64" }),
      });

      expect(parser.parse(makeRaw(topics, data))).toBeNull();
    });

    it("returns null and does not throw on malformed XDR", () => {
      const raw = makeRaw([], xdr.ScVal.scvVoid(), {
        topic: ["not-valid-base64!!!"],
      });
      expect(() => parser.parse(raw)).not.toThrow();
      expect(parser.parse(raw)).toBeNull();
    });
  });

  describe("event schema contracts", () => {
    it("locks canonical topics and deterministic payload key order", () => {
      expect(RustAcademy_EVENT_SCHEMA_CONTRACTS.EscrowDeposited).toEqual({
        topic: RustAcademy_EVENT_TOPICS.escrow,
        eventName: "EscrowDeposited",
        indexedFields: ["escrow_id", "owner"],
        payloadKeys: [
          "amount_due",
          "amount_paid",
          "expires_at",
          "ledger_sequence",
          "schema_version",
          "timestamp",
          "token",
        ],
        schemaVersion: RustAcademy_EVENT_SCHEMA_VERSION,
        compatibleVersions: [1, RustAcademy_EVENT_SCHEMA_VERSION],
      });

      for (const contract of Object.values(
        RustAcademy_EVENT_SCHEMA_CONTRACTS,
      )) {
        expect(contract.payloadKeys).toEqual([...contract.payloadKeys].sort());
        expect(contract.compatibleVersions).toContain(contract.schemaVersion);
        // All v2+ schemas carry the replay metadata field
        expect(contract.payloadKeys).toContain("ledger_sequence");
      }
    });
  });

  describe("replay metadata extraction", () => {
    it("extracts contractLedgerSequence when ledger_sequence is in payload", () => {
      const topics = [
        symVal(RustAcademy_EVENT_TOPICS.escrow),
        symVal("EscrowDeposited"),
        bytesVal(COMMITMENT_HEX),
        addressVal(OWNER),
      ];
      const data = mapVal({
        amount_due: nativeToScVal(5_000_000n, { type: "i128" }),
        amount_paid: nativeToScVal(5_000_000n, { type: "i128" }),
        expires_at: nativeToScVal(1800000000n, { type: "u64" }),
        ledger_sequence: nativeToScVal(42, { type: "u32" }),
        schema_version: nativeToScVal(RustAcademy_EVENT_SCHEMA_VERSION, { type: "u32" }),
        timestamp: nativeToScVal(1700000000n, { type: "u64" }),
        token: addressVal(TOKEN),
      });

      const result = parser.parse(makeRaw(topics, data, { ledger: 42 }));
      expect(result).not.toBeNull();
      expect(result!.contractLedgerSequence).toBe(42);
    });

    it("sets contractLedgerSequence to undefined for legacy events without the field", () => {
      const topics = [
        symVal("EscrowDeposited"),
        bytesVal(COMMITMENT_HEX),
        addressVal(OWNER),
      ];
      const data = mapVal({
        token: addressVal(TOKEN),
        amount: nativeToScVal(5_000_000n, { type: "i128" }),
        expires_at: nativeToScVal(1800000000n, { type: "u64" }),
        timestamp: nativeToScVal(1700000000n, { type: "u64" }),
        // no ledger_sequence field (legacy v1 event)
      });

      const result = parser.parse(makeRaw(topics, data));
      expect(result).not.toBeNull();
      expect(result!.contractLedgerSequence).toBeUndefined();
    });

    it("still parses the event but warns when contract ledger_sequence mismatches Horizon ledger", () => {
      const warnSpy = jest.spyOn(
        (parser as unknown as { logger: { warn: jest.Mock } }).logger,
        "warn",
      );

      const topics = [
        symVal(RustAcademy_EVENT_TOPICS.escrow),
        symVal("EscrowDeposited"),
        bytesVal(COMMITMENT_HEX),
        addressVal(OWNER),
      ];
      const data = mapVal({
        amount_due: nativeToScVal(1_000n, { type: "i128" }),
        amount_paid: nativeToScVal(1_000n, { type: "i128" }),
        expires_at: nativeToScVal(9999999n, { type: "u64" }),
        // contract says ledger 99 but Horizon reports ledger 100 (mismatch)
        ledger_sequence: nativeToScVal(99, { type: "u32" }),
        schema_version: nativeToScVal(RustAcademy_EVENT_SCHEMA_VERSION, { type: "u32" }),
        timestamp: nativeToScVal(1700000000n, { type: "u64" }),
        token: addressVal(TOKEN),
      });

      // Horizon ledger = 100, contract says 99
      const result = parser.parse(makeRaw(topics, data, { ledger: 100 }));

      // Event must still be returned (mismatch is advisory, not fatal)
      expect(result).not.toBeNull();
      expect(result!.contractLedgerSequence).toBe(99);
      expect(result!.ledgerSequence).toBe(100);

      // Mismatch must be logged for downstream monitoring
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Replay metadata mismatch"),
      );

      warnSpy.mockRestore();
    });
  });
});
