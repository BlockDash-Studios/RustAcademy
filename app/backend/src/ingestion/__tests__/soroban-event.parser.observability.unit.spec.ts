/**
 * Tests for the observability callbacks added to SorobanEventParser
 * as part of the schema-drift detection feature.
 */
import { xdr, nativeToScVal } from "@stellar/stellar-sdk";
import {
  SorobanEventParser,
  RawHorizonContractEvent,
} from "../soroban-event.parser";
import {
  RustAcademy_EVENT_TOPICS,
  RustAcademy_EVENT_SCHEMA_VERSION,
} from "../event-schema";

function symVal(s: string): xdr.ScVal {
  return xdr.ScVal.scvSymbol(s);
}
function addressVal(pk: string): xdr.ScVal {
  return nativeToScVal(pk);
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
    transaction_hash: "txhash",
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

describe("SorobanEventParser – observability callbacks", () => {
  describe("onUnknownEvent callback", () => {
    it("fires when event name is not in schema registry", () => {
      const onUnknownEvent = jest.fn();
      const parser = new SorobanEventParser(undefined, { onUnknownEvent });

      const raw = makeRaw([symVal("NonExistentEvent")], xdr.ScVal.scvVoid());
      const result = parser.parse(raw);

      expect(result).toBeNull();
      expect(onUnknownEvent).toHaveBeenCalledWith(
        expect.objectContaining({ paging_token: "100-1" }),
        "NonExistentEvent",
      );
    });

    it("does NOT fire for a known canonical topic+event pair", () => {
      const onUnknownEvent = jest.fn();
      const parser = new SorobanEventParser(undefined, { onUnknownEvent });

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
        ledger_sequence: nativeToScVal(100, { type: "u32" }),
        schema_version: nativeToScVal(RustAcademy_EVENT_SCHEMA_VERSION, { type: "u32" }),
        timestamp: nativeToScVal(1700000000n, { type: "u64" }),
        token: addressVal(TOKEN),
      });

      parser.parse(makeRaw(topics, data, { ledger: 100 }));
      expect(onUnknownEvent).not.toHaveBeenCalled();
    });
  });

  describe("onFieldMismatch callback", () => {
    it("fires when a required payload key is absent", () => {
      const onFieldMismatch = jest.fn();
      const parser = new SorobanEventParser(undefined, { onFieldMismatch });

      const topics = [
        symVal(RustAcademy_EVENT_TOPICS.escrow),
        symVal("EscrowDeposited"),
        bytesVal(COMMITMENT_HEX),
        addressVal(OWNER),
      ];
      // token is intentionally missing
      const data = mapVal({
        amount_due: nativeToScVal(1_000n, { type: "i128" }),
        amount_paid: nativeToScVal(1_000n, { type: "i128" }),
        expires_at: nativeToScVal(9999999n, { type: "u64" }),
        schema_version: nativeToScVal(RustAcademy_EVENT_SCHEMA_VERSION, { type: "u32" }),
        timestamp: nativeToScVal(1700000000n, { type: "u64" }),
        // token absent
      });

      const result = parser.parse(makeRaw(topics, data));
      // Event should be rejected due to field mismatch
      expect(result).toBeNull();
      expect(onFieldMismatch).toHaveBeenCalledWith(
        "EscrowDeposited",
        RustAcademy_EVENT_SCHEMA_VERSION,
        expect.objectContaining({ paging_token: "100-1" }),
        expect.arrayContaining(["token"]),
        expect.any(Array),
      );
    });
  });

  describe("onUnexpectedFields callback", () => {
    it("fires when extra fields are present but event is still ingested", () => {
      const onUnexpectedFields = jest.fn();
      const parser = new SorobanEventParser(undefined, { onUnexpectedFields });

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
        ledger_sequence: nativeToScVal(100, { type: "u32" }),
        schema_version: nativeToScVal(RustAcademy_EVENT_SCHEMA_VERSION, { type: "u32" }),
        timestamp: nativeToScVal(1700000000n, { type: "u64" }),
        token: addressVal(TOKEN),
        future_extra_field: nativeToScVal("some_value", { type: "string" }),
      });

      const result = parser.parse(makeRaw(topics, data, { ledger: 100 }));
      // Event is still parsed successfully
      expect(result).not.toBeNull();
      expect(result?.eventType).toBe("EscrowDeposited");
      // But the unexpected-fields callback fires
      expect(onUnexpectedFields).toHaveBeenCalledWith(
        "EscrowDeposited",
        RustAcademy_EVENT_SCHEMA_VERSION,
        expect.objectContaining({ paging_token: "100-1" }),
        expect.arrayContaining(["future_extra_field"]),
      );
    });
  });

  describe("onIncompatibleVersion callback", () => {
    it("fires when schema_version is in range but not in compatibleVersions list", () => {
      const onIncompatibleVersion = jest.fn();
      const parser = new SorobanEventParser(undefined, { onIncompatibleVersion });

      // ContractPaused only supports [2], so version 1 is incompatible
      const topics = [
        symVal(RustAcademy_EVENT_TOPICS.admin),
        symVal("ContractPaused"),
        addressVal(OWNER),
      ];
      const data = mapVal({
        paused: nativeToScVal(true),
        schema_version: nativeToScVal(1, { type: "u32" }),
        timestamp: nativeToScVal(1700000000n, { type: "u64" }),
      });

      const result = parser.parse(makeRaw(topics, data));
      expect(result).toBeNull();
      expect(onIncompatibleVersion).toHaveBeenCalledWith(
        "ContractPaused",
        1,
        expect.objectContaining({ paging_token: "100-1" }),
      );
    });
  });

  describe("onParseError callback", () => {
    it("fires when XDR decode fails", () => {
      const onParseError = jest.fn();
      const parser = new SorobanEventParser(undefined, { onParseError });

      const raw = makeRaw([], xdr.ScVal.scvVoid(), {
        topic: ["!!not-valid-base64!!"],
      });
      const result = parser.parse(raw);

      expect(result).toBeNull();
      expect(onParseError).toHaveBeenCalledWith(
        expect.objectContaining({ paging_token: "100-1" }),
        expect.any(String),
      );
    });
  });

  describe("backward-compat: legacy onUnknownSchemaVersion handler still works", () => {
    it("calls the legacy positional handler for schema_version > MAX_SUPPORTED", () => {
      const legacyHandler = jest.fn();
      const parser = new SorobanEventParser(legacyHandler);

      const topics = [
        symVal(RustAcademy_EVENT_TOPICS.escrow),
        symVal("EscrowDeposited"),
        bytesVal(COMMITMENT_HEX),
        addressVal(OWNER),
      ];
      const data = mapVal({
        schema_version: nativeToScVal(999, { type: "u32" }),
        amount_due: nativeToScVal(1n, { type: "i128" }),
        amount_paid: nativeToScVal(1n, { type: "i128" }),
        expires_at: nativeToScVal(1n, { type: "u64" }),
        timestamp: nativeToScVal(1n, { type: "u64" }),
        token: addressVal(TOKEN),
      });

      parser.parse(makeRaw(topics, data, { paging_token: "777-1" }));
      expect(legacyHandler).toHaveBeenCalledWith("EscrowDeposited", 999, "777-1");
    });
  });
});
