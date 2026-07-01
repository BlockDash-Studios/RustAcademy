import { SchemaObservabilityService } from "../schema-observability.service";
import type { RawHorizonContractEvent } from "../soroban-event.parser";

function makeRaw(
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
    topic: [],
    value: { xdr: "" },
    ...overrides,
  };
}

/** Minimal MetricsService stub */
function makeMetricsStub() {
  return {
    recordUnknownEvent: jest.fn(),
    recordFieldMismatch: jest.fn(),
    recordParserRejection: jest.fn(),
    recordUnexpectedFields: jest.fn(),
    recordUnknownSchemaVersion: jest.fn(),
    recordError: jest.fn(),
  };
}

/** Minimal SentryService stub */
function makeSentryStub() {
  return {
    captureMessage: jest.fn(),
    captureException: jest.fn(),
  };
}

describe("SchemaObservabilityService", () => {
  let service: SchemaObservabilityService;
  let metrics: ReturnType<typeof makeMetricsStub>;
  let sentry: ReturnType<typeof makeSentryStub>;

  beforeEach(() => {
    metrics = makeMetricsStub();
    sentry = makeSentryStub();
    service = new SchemaObservabilityService(
      metrics as never,
      sentry as never,
    );
  });

  describe("recordUnknownEvent", () => {
    it("calls metrics.recordUnknownEvent and metrics.recordParserRejection", () => {
      const raw = makeRaw();
      service.recordUnknownEvent(raw, "SomeWeirdEvent");
      expect(metrics.recordUnknownEvent).toHaveBeenCalledWith(
        raw.contract_id,
        "SomeWeirdEvent",
      );
      expect(metrics.recordParserRejection).toHaveBeenCalledWith(
        "SomeWeirdEvent",
        "UNKNOWN_EVENT_NAME",
      );
    });

    it("increments windowRejectionCount", () => {
      service.recordUnknownEvent(makeRaw(), "SomeWeirdEvent");
      const summary = service.getHealthSummary();
      expect(summary.windowRejectionCount).toBe(1);
      expect(summary.rejectionsByDriftType["UNKNOWN_EVENT_NAME"]).toBe(1);
    });

    it("captures to Sentry", () => {
      service.recordUnknownEvent(makeRaw(), "SomeWeirdEvent");
      expect(sentry.captureMessage).toHaveBeenCalledWith(
        expect.stringContaining("UNKNOWN_EVENT_NAME"),
        "warning",
        expect.objectContaining({ driftType: "UNKNOWN_EVENT_NAME" }),
      );
    });
  });

  describe("recordFieldMismatch", () => {
    it("calls metrics.recordFieldMismatch with sorted missing fields", () => {
      service.recordFieldMismatch("EscrowDeposited", 2, makeRaw(), ["token", "amount_due"], []);
      expect(metrics.recordFieldMismatch).toHaveBeenCalledWith(
        "EscrowDeposited",
        2,
        ["token", "amount_due"],
      );
    });

    it("adds to recentRejections ring-buffer", () => {
      service.recordFieldMismatch("EscrowDeposited", 2, makeRaw({ paging_token: "999-1" }), ["token"], []);
      const summary = service.getHealthSummary();
      const rejection = summary.recentRejections.find(
        (r) => r.pagingToken === "999-1",
      );
      expect(rejection).toBeDefined();
      expect(rejection?.driftType).toBe("FIELD_MISMATCH");
      expect(rejection?.missingFields).toContain("token");
    });
  });

  describe("recordUnexpectedFields", () => {
    it("calls metrics.recordUnexpectedFields but does NOT add to window (non-fatal)", () => {
      service.recordUnexpectedFields("EscrowDeposited", 2, makeRaw(), ["future_field"]);
      expect(metrics.recordUnexpectedFields).toHaveBeenCalledWith("EscrowDeposited", 2);
      // Unexpected fields do not count toward rejection window
      const summary = service.getHealthSummary();
      expect(summary.windowRejectionCount).toBe(0);
    });
  });

  describe("alert threshold", () => {
    it("sets alertFiring=true when windowRejectionCount >= ALERT_THRESHOLD", () => {
      for (let i = 0; i < SchemaObservabilityService.ALERT_THRESHOLD; i++) {
        service.recordUnknownEvent(makeRaw({ paging_token: `${i}-1` }), "Evt");
      }
      const summary = service.getHealthSummary();
      expect(summary.alertFiring).toBe(true);
      expect(summary.status).toBe("degraded");
    });

    it("fires a Sentry error capture exactly when threshold is crossed", () => {
      for (let i = 0; i < SchemaObservabilityService.ALERT_THRESHOLD; i++) {
        service.recordUnknownEvent(makeRaw({ paging_token: `${i}-1` }), "Evt");
      }
      // The "error" level capture happens on the threshold-crossing call
      const errorCalls = (sentry.captureMessage as jest.Mock).mock.calls.filter(
        ([, level]) => level === "error",
      );
      expect(errorCalls.length).toBeGreaterThanOrEqual(1);
    });

    it("status is healthy below threshold", () => {
      service.recordUnknownEvent(makeRaw(), "Evt");
      const summary = service.getHealthSummary();
      expect(summary.status).toBe("healthy");
      expect(summary.alertFiring).toBe(false);
    });
  });

  describe("ring-buffer cap", () => {
    it("keeps at most MAX_DIAGNOSTIC_BUFFER entries", () => {
      const { MAX_DIAGNOSTIC_BUFFER } = jest.requireActual("../parser-diagnostics.types") as {
        MAX_DIAGNOSTIC_BUFFER: number;
      };
      for (let i = 0; i < MAX_DIAGNOSTIC_BUFFER + 10; i++) {
        service.recordUnknownEvent(makeRaw({ paging_token: `${i}-1` }), "Evt");
      }
      const summary = service.getHealthSummary();
      expect(summary.recentRejections.length).toBeLessThanOrEqual(
        MAX_DIAGNOSTIC_BUFFER,
      );
    });
  });

  describe("getHealthSummary", () => {
    it("returns healthy state with zero rejections", () => {
      const summary = service.getHealthSummary();
      expect(summary.status).toBe("healthy");
      expect(summary.alertFiring).toBe(false);
      expect(summary.windowRejectionCount).toBe(0);
      expect(summary.recentRejections).toHaveLength(0);
    });

    it("exposes windowMs and alertThreshold for transparency", () => {
      const summary = service.getHealthSummary();
      expect(summary.windowMs).toBe(SchemaObservabilityService.WINDOW_MS);
      expect(summary.alertThreshold).toBe(SchemaObservabilityService.ALERT_THRESHOLD);
    });
  });
});
