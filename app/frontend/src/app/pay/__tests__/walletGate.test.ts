import { describe, expect, it } from "vitest";
import {
  getWalletStatus,
  normalizeNetwork,
  resolvePaymentReadiness,
  type PaymentReadiness,
  type WalletStatus,
} from "@/lib/walletStatus";

describe("normalizeNetwork", () => {
  it("normalizes known networks case-insensitively", () => {
    expect(normalizeNetwork("TestNet")).toBe("testnet");
    expect(normalizeNetwork("MAINNET")).toBe("mainnet");
    expect(normalizeNetwork("futurenet")).toBe("futurenet");
  });

  it("returns undefined for unknown or missing networks", () => {
    expect(normalizeNetwork(undefined)).toBeUndefined();
    expect(normalizeNetwork(null)).toBeUndefined();
    expect(normalizeNetwork("custom")).toBeUndefined();
  });
});

describe("getWalletStatus", () => {
  const base = {
    supported: true,
    connected: true,
    walletNetwork: "testnet" as const,
    appNetwork: "testnet" as const,
  };

  it("reports connected when the wallet matches the app network", () => {
    expect(getWalletStatus(base)).toBe("connected");
  });

  it("reports unsupported when no wallet extension is present", () => {
    expect(getWalletStatus({ ...base, supported: false })).toBe("unsupported");
  });

  it("reports disconnected when the wallet is not connected", () => {
    expect(getWalletStatus({ ...base, connected: false })).toBe("disconnected");
  });

  it("reports wrong_network when wallet and app networks differ", () => {
    expect(getWalletStatus({ ...base, walletNetwork: "mainnet" })).toBe(
      "wrong_network",
    );
  });

  it("does not flag a mismatch when either network is unknown", () => {
    expect(getWalletStatus({ ...base, walletNetwork: null })).toBe("connected");
    expect(getWalletStatus({ ...base, appNetwork: undefined })).toBe(
      "connected",
    );
  });
});

describe("resolvePaymentReadiness", () => {
  const FAILURE_STATUSES: WalletStatus[] = [
    "unsupported",
    "disconnected",
    "wrong_network",
  ];

  it("is ready when the wallet is connected", () => {
    const readiness = resolvePaymentReadiness("connected");
    expect(readiness).toEqual({ ready: true, status: "connected" });
  });

  it("is not ready during detection", () => {
    const readiness = resolvePaymentReadiness("checking");
    expect(readiness.ready).toBe(false);
  });

  it("returns a recovery action for every failure state", () => {
    for (const status of FAILURE_STATUSES) {
      const readiness = resolvePaymentReadiness(status);
      expect(readiness.ready).toBe(false);
      expect((readiness as Extract<PaymentReadiness, { ready: false }>).recovery.length).toBeGreaterThan(0);
    }
  });

  it("guides unsupported users to install a wallet", () => {
    const readiness = resolvePaymentReadiness("unsupported");
    expect(readiness.ready).toBe(false);
    expect(
      (readiness as Extract<PaymentReadiness, { ready: false }>)
        .recovery.toLowerCase(),
    ).toContain("freighter");
  });

  it("guides disconnected users to connect their wallet", () => {
    const readiness = resolvePaymentReadiness("disconnected");
    expect(readiness.ready).toBe(false);
    expect(
      (readiness as Extract<PaymentReadiness, { ready: false }>)
        .recovery.toLowerCase(),
    ).toContain("connect");
  });

  it("guides wrong-network users to switch networks", () => {
    const readiness = resolvePaymentReadiness("wrong_network");
    expect(readiness.ready).toBe(false);
    expect(
      (readiness as Extract<PaymentReadiness, { ready: false }>)
        .recovery.toLowerCase(),
    ).toContain("switch");
  });
});