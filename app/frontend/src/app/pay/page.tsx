"use client";

import { useEffect, useState } from "react";
import PaymentPageClient from "./PaymentPageClient";
import {
  getWalletStatus,
  normalizeNetwork,
  resolvePaymentReadiness,
  type WalletNetwork,
  type WalletStatus,
} from "@/lib/walletStatus";

function detectWallet(appNetwork: WalletNetwork): {
  supported: boolean;
  connected: boolean;
  walletNetwork: WalletNetwork | null;
} {
  if (typeof window === "undefined") {
    return { supported: false, connected: false, walletNetwork: null };
  }
  const freighter = (window as Window & { freighterApi?: unknown })
    .freighterApi;
  // Local / mock mode simulates a connected wallet so the existing payment
  // flow keeps working without a real extension installed.
  if (
    !freighter &&
    (process.env.NODE_ENV !== "production" ||
      process.env.NEXT_PUBLIC_API_MOCK === "true")
  ) {
    return { supported: true, connected: true, walletNetwork: appNetwork };
  }
  if (!freighter) {
    return { supported: false, connected: false, walletNetwork: null };
  }
  return { supported: true, connected: true, walletNetwork: appNetwork };
}

const RECOVERY_TITLE: Record<
  "unsupported" | "disconnected" | "wrong_network",
  string
> = {
  unsupported: "Wallet extension required",
  disconnected: "Connect your wallet",
  wrong_network: "Wrong network",
};

export default function PayPage() {
  const appNetwork =
    normalizeNetwork(process.env.NEXT_PUBLIC_STELLAR_NETWORK) ?? "testnet";
  const [status, setStatus] = useState<WalletStatus>("checking");

  useEffect(() => {
    setStatus(getWalletStatus(detectWallet(appNetwork)));
  }, [appNetwork]);

  const readiness = resolvePaymentReadiness(status);

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-neutral-400">Detecting wallet…</p>
      </div>
    );
  }

  if (!readiness.ready) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center text-2xl">
          ⚠️
        </div>
        <h1 className="text-2xl font-black">{RECOVERY_TITLE[readiness.status]}</h1>
        <p className="max-w-md text-sm text-neutral-300">{readiness.recovery}</p>
        <button
          type="button"
          onClick={() => {
            setStatus("checking");
            setStatus(getWalletStatus(detectWallet(appNetwork)));
          }}
          className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400"
        >
          Retry
        </button>
      </div>
    );
  }

  return <PaymentPageClient />;
}
export default function PayPage() {
  return (
    <div id="payment-page" aria-label="Payment page">
      <PaymentPageClient />
    </div>
  );
}
