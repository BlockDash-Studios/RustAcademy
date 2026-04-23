"use client";

import { useState } from "react";
import {
  MarketplaceListing,
  formatCountdown,
  placeBid,
} from "@/hooks/marketplaceApi";

type BidModalProps = {
  listing: MarketplaceListing | null;
  onClose: () => void;
  onBidSuccess: (username: string, amount: number) => void;
};

type BidState = "idle" | "loading" | "success" | "error";

export function BidModal({
  listing,
  onClose,
  onBidSuccess,
}: BidModalProps) {
  const [amount, setAmount] = useState("");
  const [bidState, setBidState] = useState<BidState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const minBid = listing ? listing.currentBid + 1 : 1;
  const parsedAmount = parseFloat(amount);
  const isValid = !Number.isNaN(parsedAmount) && parsedAmount >= minBid;

  async function handleConfirm() {
    if (!listing || !isValid) {
      return;
    }

    setBidState("loading");
    setErrorMsg("");

    const result = await placeBid(listing.username, parsedAmount);
    if (result.success) {
      setBidState("success");
      onBidSuccess(listing.username, parsedAmount);
    } else {
      setBidState("error");
      setErrorMsg(result.reason);
    }
  }

  function handleClose() {
    setBidState("idle");
    setAmount("");
    setErrorMsg("");
    onClose();
  }

  if (!listing) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={bidState === "loading" ? undefined : handleClose}
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="pointer-events-none absolute -inset-1 rounded-3xl bg-gradient-to-br from-indigo-500/30 via-purple-500/20 to-transparent blur-xl" />

        <div className="relative rounded-3xl border border-white/10 bg-neutral-900/90 p-8 shadow-2xl backdrop-blur-2xl">
          {bidState === "success" ? (
            <div className="space-y-5 py-4 text-center">
              <div aria-hidden="true" className="text-6xl">
                Success
              </div>
              <h2 className="text-2xl font-black">Bid Placed</h2>
              <p className="text-neutral-300">
                You are leading with{" "}
                <span className="font-bold text-indigo-200">
                  {parsedAmount} USDC
                </span>{" "}
                on <span className="font-bold text-white">@{listing.username}</span>.
              </p>
              <div className="rounded-2xl border border-indigo-300/30 bg-indigo-500/10 p-4 text-left font-mono text-xs text-neutral-200">
                <p className="mb-1 font-bold text-indigo-200">
                  tx signed and broadcast
                </p>
                <p>Network: Stellar Testnet</p>
                <p>Asset: USDC</p>
                <p>Amount: {parsedAmount}.00 USDC</p>
                <p>Ledger: about 2s settlement</p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="w-full rounded-xl bg-indigo-500 py-3 font-bold text-white transition hover:bg-indigo-400"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-widest text-neutral-300">
                    Place a Bid
                  </p>
                  <h2 className="text-2xl font-black tracking-tight">
                    @{listing.username}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={bidState === "loading"}
                  aria-label="Close bid modal"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-neutral-300 transition hover:bg-white/10 hover:text-white"
                >
                  X
                </button>
              </div>

              <div className="mb-6 grid grid-cols-3 gap-3">
                {[
                  { label: "Current Bid", value: `${listing.currentBid} USDC` },
                  { label: "Bids", value: listing.bidCount.toString() },
                  { label: "Ends In", value: formatCountdown(listing.endsAt) },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-white/5 bg-white/5 p-3 text-center"
                  >
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-300">
                      {stat.label}
                    </p>
                    <p className="text-sm font-black">{stat.value}</p>
                  </div>
                ))}
              </div>

              <label
                htmlFor="bid-modal-amount"
                className="mb-2 block text-xs font-bold uppercase tracking-widest text-neutral-300"
              >
                Your Bid (USDC)
              </label>
              <div className="relative mb-4">
                <input
                  id="bid-modal-amount"
                  type="number"
                  min={minBid}
                  step="1"
                  placeholder={`Min ${minBid} USDC`}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  disabled={bidState === "loading"}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-4 pr-20 text-lg font-bold text-white placeholder:text-neutral-400"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black tracking-widest text-indigo-200">
                  USDC
                </span>
              </div>

              {amount && !isValid && (
                <p className="mb-3 text-xs font-bold text-red-300">
                  Bid must be at least {minBid} USDC
                </p>
              )}

              {bidState === "error" && (
                <div className="mb-4 rounded-xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-200">
                  Warning: {errorMsg}
                </div>
              )}

              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-500/5 p-3">
                <span aria-hidden="true" className="text-amber-200">
                  Key
                </span>
                <p className="text-[11px] leading-relaxed text-amber-100">
                  Confirming will request a signature from your Stellar wallet.
                  No funds will be deducted until the auction ends.
                </p>
              </div>

              <button
                type="button"
                onClick={handleConfirm}
                disabled={!isValid || bidState === "loading"}
                className={`w-full rounded-xl py-4 text-base font-black tracking-wide transition-all ${
                  bidState === "loading"
                    ? "cursor-wait bg-indigo-500/40 text-white/60"
                    : isValid
                      ? "bg-indigo-500 text-white shadow-[0_12px_40px_-15px_rgba(99,102,241,0.6)] hover:scale-[1.02] hover:bg-indigo-400 active:scale-[0.98]"
                      : "cursor-not-allowed bg-white/5 text-neutral-500"
                }`}
              >
                {bidState === "loading" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Signing Transaction...
                  </span>
                ) : (
                  "Confirm Bid ->"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
