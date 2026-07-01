import { xdr, nativeToScVal } from "@stellar/stellar-sdk";
import { SchemaDriftDetector } from "../schema-drift-detector";
import type { SorobanEventType } from "../types/contract-event.types";

function mapVal(entries: Record<string, xdr.ScVal>): xdr.ScVal {
  const mapEntries = Object.entries(entries).map(
    ([k, v]) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: v }),
  );
  return xdr.ScVal.scvMap(mapEntries);
}

const TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
function addressVal(pubkey: string): xdr.ScVal {
  return nativeToScVal(pubkey);
}

describe("SchemaDriftDetector", () => {
  const detector = new SchemaDriftDetector();

  describe("detectFieldDrift – EscrowDeposited", () => {
    const eventName: SorobanEventType = "EscrowDeposited";

    it("returns no drift for a complete v2 payload", () => {
      const map = detector.decodeToMap(
        mapVal({
          amount_due: nativeToScVal(1_000n, { type: "i128" }),
          amount_paid: nativeToScVal(1_000n, { type: "i128" }),
          expires_at: nativeToScVal(9999999n, { type: "u64" }),
          ledger_sequence: nativeToScVal(42, { type: "u32" }),
          schema_version: nativeToScVal(2, { type: "u32" }),
          timestamp: nativeToScVal(1700000000n, { type: "u64" }),
          token: addressVal(TOKEN),
        }),
      );

      const result = detector.detectFieldDrift(eventName, map);
      expect(result.driftType).toBeNull();
      expect(result.missingFields).toHaveLength(0);
    });

    it("returns FIELD_MISMATCH when token is absent", () => {
      const map = detector.decodeToMap(
        mapVal({
          amount_due: nativeToScVal(1_000n, { type: "i128" }),
          amount_paid: nativeToScVal(1_000n, { type: "i128" }),
          expires_at: nativeToScVal(9999999n, { type: "u64" }),
          timestamp: nativeToScVal(1700000000n, { type: "u64" }),
          // token is missing
        }),
      );

      const result = detector.detectFieldDrift(eventName, map);
      expect(result.driftType).toBe("FIELD_MISMATCH");
      expect(result.missingFields).toContain("token");
    });

    it("does NOT flag schema_version absence as drift (optional field)", () => {
      const map = detector.decodeToMap(
        mapVal({
          amount_due: nativeToScVal(1_000n, { type: "i128" }),
          amount_paid: nativeToScVal(1_000n, { type: "i128" }),
          expires_at: nativeToScVal(9999999n, { type: "u64" }),
          timestamp: nativeToScVal(1700000000n, { type: "u64" }),
          token: addressVal(TOKEN),
          // schema_version intentionally absent (v1 legacy)
        }),
      );

      const result = detector.detectFieldDrift(eventName, map);
      expect(result.driftType).toBeNull();
      expect(result.missingFields).toHaveLength(0);
    });

    it("reports unexpected extra fields without triggering FIELD_MISMATCH", () => {
      const map = detector.decodeToMap(
        mapVal({
          amount_due: nativeToScVal(1_000n, { type: "i128" }),
          amount_paid: nativeToScVal(1_000n, { type: "i128" }),
          expires_at: nativeToScVal(9999999n, { type: "u64" }),
          timestamp: nativeToScVal(1700000000n, { type: "u64" }),
          token: addressVal(TOKEN),
          new_field_from_future_contract: nativeToScVal("future", { type: "string" }),
        }),
      );

      const result = detector.detectFieldDrift(eventName, map);
      expect(result.driftType).toBeNull(); // not a hard rejection
      expect(result.unexpectedFields).toContain("new_field_from_future_contract");
    });

    it("missingFields are sorted alphabetically", () => {
      const map = detector.decodeToMap(
        mapVal({
          // Only timestamp present; amount_due, amount_paid, expires_at, token missing
          timestamp: nativeToScVal(1700000000n, { type: "u64" }),
        }),
      );

      const result = detector.detectFieldDrift(eventName, map);
      expect(result.driftType).toBe("FIELD_MISMATCH");
      expect(result.missingFields).toEqual([...result.missingFields].sort());
    });
  });

  describe("detectFieldDrift – unknown event name", () => {
    it("returns no drift for unknown event names (handled elsewhere)", () => {
      const result = detector.detectFieldDrift(
        "UnknownEvent" as SorobanEventType,
        {},
      );
      expect(result.driftType).toBeNull();
      expect(result.missingFields).toHaveLength(0);
    });
  });

  describe("decodeToMap", () => {
    it("returns an empty map for void ScVal", () => {
      const result = detector.decodeToMap(xdr.ScVal.scvVoid());
      expect(result).toEqual({});
    });

    it("correctly decodes key-value map entries", () => {
      const data = mapVal({
        foo: nativeToScVal(42n, { type: "i128" }),
      });
      const result = detector.decodeToMap(data);
      expect(Object.keys(result)).toContain("foo");
    });
  });

  describe("extractSafePayloadSnapshot", () => {
    it("returns a string-keyed snapshot without throwing", () => {
      const data = mapVal({
        amount: nativeToScVal(12345n, { type: "i128" }),
        token: addressVal(TOKEN),
      });
      const snapshot = detector.extractSafePayloadSnapshot(data);
      expect(snapshot).toHaveProperty("amount");
      expect(snapshot).toHaveProperty("token");
      expect(typeof snapshot.amount).toBe("string");
    });
  });
});
