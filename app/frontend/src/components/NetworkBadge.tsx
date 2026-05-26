"use client";

import { useEffect, useState } from "react";
import { getClientEnv } from "@/lib/env";

export function NetworkBadge() {
  const [network, setNetwork] = useState<string | undefined>(undefined);
  const [explicit, setExplicit] = useState(false);

  useEffect(() => {
    const env = getClientEnv();
    setNetwork(env?.stellarNetwork);
    setExplicit(Boolean(env?.stellarNetwork));
  }, []);

  if (!network) return null;

  const normalized = network.toLowerCase();

  const badgeStyles: Record<string, string> = {
    testnet: "bg-yellow-100 text-yellow-800 border border-yellow-200",
    futurenet: "bg-blue-100 text-blue-800 border border-blue-200",
    mainnet: "bg-green-100 text-green-800 border border-green-200",
  };

  const label = {
    testnet: "TESTNET",
    futurenet: "FUTURENET",
    mainnet: "MAINNET",
  }[normalized] ?? network.toUpperCase();

  return (
    <div
      className={`fixed top-4 left-60 px-3 py-1 rounded-full text-xs font-bold transition-all ${badgeStyles[normalized] || ""}`}
    >
      {label}

      {!explicit && (
        <span className="ml-2 opacity-50 font-normal italic">(default)</span>
      )}
    </div>
  );
}
