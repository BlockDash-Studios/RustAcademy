/**
 * Client-side wallet state validation for the payment flow.
 *
 * Kept as pure functions so the failure matrix can be tested without a
 * browser or a wallet extension.
 */

export type WalletNetwork = "testnet" | "futurenet" | "mainnet";

export type WalletStatus =
  | "checking"
  | "unsupported"
  | "disconnected"
  | "wrong_network"
  | "connected";

export type PaymentReadiness =
  | { ready: true; status: "connected" }
  | {
      ready: false;
      status: "unsupported" | "disconnected" | "wrong_network";
      recovery: string;
    };

/** Normalize a raw network string (e.g. an env var) to a known Stellar network. */
export function normalizeNetwork(
  network?: string | null,
): WalletNetwork | undefined {
  const normalized = network?.toLowerCase();
  if (
    normalized === "testnet" ||
    normalized === "futurenet" ||
    normalized === "mainnet"
  ) {
    return normalized;
  }
  return undefined;
}

/**
 * Resolve the wallet state from raw inputs. A wrong-network state is only
 * reported when both the wallet and the app expose a known network.
 */
export function getWalletStatus(input: {
  supported: boolean;
  connected: boolean;
  walletNetwork?: WalletNetwork | null;
  appNetwork?: WalletNetwork | null;
}): WalletStatus {
  if (!input.supported) return "unsupported";
  if (!input.connected) return "disconnected";
  if (
    input.walletNetwork &&
    input.appNetwork &&
    input.walletNetwork !== input.appNetwork
  ) {
    return "wrong_network";
  }
  return "connected";
}

/** Map a wallet status to a recoverable payment-readiness decision. */
export function resolvePaymentReadiness(status: WalletStatus): PaymentReadiness {
  switch (status) {
    case "connected":
      return { ready: true, status: "connected" };
    case "unsupported":
      return {
        ready: false,
        status: "unsupported",
        recovery:
          "Install the Freighter wallet extension, then reload this page to continue with the payment.",
      };
    case "disconnected":
      return {
        ready: false,
        status: "disconnected",
        recovery:
          "Open Freighter and connect your account, then retry the payment.",
      };
    case "wrong_network":
      return {
        ready: false,
        status: "wrong_network",
        recovery:
          "Switch your wallet to the required Stellar network, then retry the payment.",
      };
    case "checking":
      return {
        ready: false,
        status: "disconnected",
        recovery: "Detecting your Stellar wallet…",
      };
  }
}