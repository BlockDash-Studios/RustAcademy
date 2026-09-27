"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

type WalletNetwork = "testnet" | "futurenet" | "mainnet";

interface NetworkBadgeProps {
  /** Optional wallet network (from the wallet gateway) to compare against. */
  walletNetwork?: WalletNetwork | null;
  /** Force the mismatch indicator even when walletNetwork is omitted. */
  mismatch?: boolean;
}

export function NetworkBadge({ walletNetwork, mismatch = false }: NetworkBadgeProps) {
  const [appNetwork, setAppNetwork] = useState<string | undefined>(undefined);

  useEffect(() => {
    setAppNetwork(process.env.NEXT_PUBLIC_STELLAR_NETWORK);
  }, []);

  const hasMismatch =
    walletNetwork !== undefined &&
    walletNetwork !== null &&
    walletNetwork !== (appNetwork?.toLowerCase() as WalletNetwork | undefined);

  if (!appNetwork) return null;

  const normalized = appNetwork.toLowerCase();

  const badgeStyles: Record<string, string> = {
    testnet: "bg-yellow-100 text-yellow-800 border border-yellow-200",
    futurenet: "bg-blue-100 text-blue-800 border border-blue-200",
    mainnet: "bg-green-100 text-green-800 border border-green-200",
  };

  const label = {
    testnet: "TESTNET",
    futurenet: "FUTURENET",
    mainnet: "MAINNET",
  }[normalized] ?? appNetwork.toUpperCase();

  const mismatchActive = mismatch || (walletNetwork !== undefined && hasMismatch);

  return (
    <div className="fixed top-4 right-4 md:right-auto md:left-80 z-50 flex items-center gap-2">
      <div
        className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${badgeStyles[normalized] || ""}`}
      >
        {label}

        {!process.env.NEXT_PUBLIC_STELLAR_NETWORK && (
          <span className="ml-2 opacity-50 font-normal italic">(default)</span>
        )}
      </div>

      {mismatchActive && (
        <div
          role="alert"
          className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-300 animate-in fade-in duration-200"
        >
          <AlertTriangle size={12} aria-hidden="true" />
          NETWORK MISMATCH
        </div>
      )}
    </div>
  );
}