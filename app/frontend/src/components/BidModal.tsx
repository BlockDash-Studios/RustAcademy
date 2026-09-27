"use client";

import { useEffect, useRef, useState } from "react";
import type { MarketplaceListing } from "@/hooks/marketplaceApi";
import { validateBidRequest } from "@/hooks/marketplaceApi";
import { useMarketplaceApi } from "@/hooks/MarketplaceApiContext";
import { errorReporter } from "@/lib/errorReporter";
import { SigningSummary } from "./SigningSummary";

type BidModalProps = {
  listing: MarketplaceListing | null;
  onClose: () => void;
  onBidSuccess: (username: string, amount: number) => void;
};

type BidState = "idle" | "loading" | "success" | "error";

export function BidModal({ listing, onClose, onBidSuccess }: BidModalProps) {
  const [amount, setAmount] = useState("");
  const [bidState, setBidState] = useState<BidState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Consume placeBid and formatCountdown from the active provider via context.
  // BidModal no longer imports any concrete provider — the caller's provider
  // tree determines whether mock or production behaviour is used.
  const { placeBid, formatCountdown } = useMarketplaceApi();

  const minBid = listing ? listing.currentBid + 1 : 1;
  // Strict numeric parse — "12abc" and "" must both be rejected.
  const parsedAmount = amount.trim() === "" ? NaN : Number(amount);
  const isValid = Number.isFinite(parsedAmount) && parsedAmount >= minBid;

  useEffect(() => {
    if (!listing) return;

    previousFocusRef.current = document.activeElement as HTMLElement;
    const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
      "input, button:not([disabled])"
    );
    firstFocusable?.focus();

    return () => previousFocusRef.current?.focus();
  }, [listing]);

  async function handleConfirm() {
    // Double-submit guard: ignore re-entry while a request is in flight.
    if (!listing || bidState === "loading") return;

    // Validate the request shape before any network submission.
    const validation = validateBidRequest(listing.username, parsedAmount, {
      minAmount: minBid,
    });
    if (!validation.ok) {
      setBidState("error");
      setErrorMsg(validation.reason);
      return;
    }

    setBidState("loading");
    setErrorMsg("");

    try {
      const result = await placeBid(listing.username, parsedAmount);
      if (result.success) {
        setBidState("success");
        onBidSuccess(listing.username, parsedAmount);
        return;
      }
      setBidState("error");
      setErrorMsg(result.reason);
      // Capture the user-visible failure for observability. Only safe fields
      // are attached — no request bodies or wallet material.
      void errorReporter.captureError(
        new Error(`Bid submission failed: ${result.reason}`),
        {
          route: "/marketplace",
          codeOrigin: "BidModal.placeBid",
          extra: {
            source: "BidModal",
            operation: "placeBid",
            listingId: listing.id,
            username: listing.username,
          },
        },
      );
    } catch (err) {
      // Defensive: providers resolve with results, but never let an
      // unexpected rejection crash the modal.
      setBidState("error");
      setErrorMsg("Something went wrong while placing your bid. Please try again.");
      void errorReporter.captureError(
        err instanceof Error ? err : new Error(String(err)),
        {
          route: "/marketplace",
          codeOrigin: "BidModal.placeBid",
          extra: { source: "BidModal", operation: "placeBid", listingId: listing.id },
        },
      );
    }
  }

  function handleClose() {
    setBidState("idle");
    setAmount("");
    setErrorMsg("");
    setShowPreview(false);
    onClose();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && bidState !== "loading") {
      event.preventDefault();
      handleClose();
      return;
    }

    if (event.key !== "Tab" || !modalRef.current) return;
    const focusableElements = Array.from(
      modalRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])"
      )
    );
    if (focusableElements.length === 0) return;
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  if (!listing) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bid-modal-title"
      onKeyDown={handleKeyDown}
    >
      {/* Blurred backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={bidState === "loading" ? undefined : handleClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Glow aura */}
        <div className="absolute -inset-1 bg-gradient-to-br from-indigo-500/30 via-purple-500/20 to-transparent rounded-3xl blur-xl pointer-events-none" />

        <div ref={modalRef} className="relative bg-neutral-900/90 border border-white/10 rounded-3xl p-8 shadow-2xl backdrop-blur-2xl">

          {/* ── SUCCESS STATE ─────────────────────────────── */}
          {bidState === "success" && (
            <div className="text-center py-4 space-y-5">
              <div className="text-6xl animate-bounce">🎉</div>
              <h2 id="bid-modal-title" className="text-2xl font-black">Bid Placed!</h2>
              <p className="text-neutral-400">
                You&apos;re leading with{" "}
                <span className="text-indigo-400 font-bold">{parsedAmount} USDC</span> on{" "}
                <span className="text-white font-bold">@{listing.username}</span>.
              </p>
              <div className="p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-left text-xs text-neutral-400 font-mono">
                <p className="font-bold text-indigo-400 mb-1">tx signed &amp; broadcast ✓</p>
                <p>Network: Stellar Testnet</p>
                <p>Asset: USDC</p>
                <p>Amount: {parsedAmount}.00 USDC</p>
                <p>Ledger: ~2s settlement</p>
              </div>
              <button
                onClick={handleClose}
                type="button"
                className="w-full py-3 bg-indigo-500 text-white font-bold rounded-xl hover:bg-indigo-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
              >
                Done
              </button>
            </div>
          )}

          {/* ── IDLE / LOADING / ERROR STATES ─────────────── */}
          {bidState !== "success" && (
            <>
              {/* Header */}
              <div className="flex justify-between items-start mb-6">
                <div>
                  <p className="text-xs text-neutral-500 uppercase tracking-widest font-bold mb-1">
                    Place a Bid
                  </p>
                  <h2 id="bid-modal-title" className="text-2xl font-black tracking-tight">
                    @{listing.username}
                  </h2>
                </div>
                <button
                  onClick={handleClose}
                  type="button"
                  aria-label="Close bid dialog"
                  disabled={bidState === "loading"}
                  className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                >
                  ✕
                </button>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                  { label: "Current Bid", value: `${listing.currentBid} USDC` },
                  { label: "Bids", value: listing.bidCount.toString() },
                  { label: "Ends In", value: formatCountdown(listing.endsAt) },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="p-3 bg-white/5 rounded-2xl border border-white/5 text-center"
                  >
                    <p className="text-[10px] uppercase tracking-widest font-bold text-neutral-500 mb-1">
                      {s.label}
                    </p>
                    <p className="font-black text-sm">{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Input */}
              <label htmlFor="bid-amount" className="block mb-2 text-xs font-bold uppercase tracking-widest text-neutral-500">
                Your Bid (USDC)
              </label>
              <div className="relative mb-4">
                <input
                  id="bid-amount"
                  type="number"
                  min={minBid}
                  step="1"
                  placeholder={`Min ${minBid} USDC`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={bidState === "loading"}
                  aria-invalid={Boolean(amount && !isValid)}
                  aria-describedby={amount && !isValid ? "bid-amount-error" : undefined}
                  className="w-full bg-white/5 border border-white/10 focus:border-indigo-500/60 rounded-xl px-4 py-4 pr-20 font-bold text-white placeholder-neutral-600 outline-none transition text-lg focus-visible:ring-2 focus-visible:ring-indigo-300"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-indigo-400 tracking-widest">
                  USDC
                </span>
              </div>

              {/* Validation hint */}
              {amount && !isValid && (
                <p id="bid-amount-error" role="alert" className="text-xs text-red-400 font-bold mb-3">
                  Bid must be at least {minBid} USDC
                </p>
              )}

              {/* Error */}
              {bidState === "error" && (
                <div role="alert" className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 font-bold">
                  ⚠ {errorMsg}
                </div>
              )}

              {/* Wallet warning */}
              <div className="flex items-start gap-3 p-3 mb-5 bg-amber-500/5 border border-amber-500/15 rounded-2xl">
                <span className="text-amber-400 mt-0.5">🔑</span>
                <div className="text-[11px] text-amber-400/80 leading-relaxed">
                  <p className="font-bold mb-1">Wallet Connection Required</p>
                  <p>
                    Confirming will request a signature from your Stellar wallet
                    (Freighter/Lobstr). No funds will be deducted until auction ends.
                  </p>
                </div>
              </div>

              {/* Bidding rules */}
              {!showPreview && (
                <div className="flex items-start gap-3 p-3 mb-5 bg-indigo-500/5 border border-indigo-500/15 rounded-2xl">
                  <span className="text-indigo-400 mt-0.5">📋</span>
                  <div className="text-[11px] text-indigo-400/80 leading-relaxed">
                    <p className="font-bold mb-1">Bidding Rules</p>
                    <ul className="space-y-0.5">
                      <li>• Minimum increment: +1 USDC above current bid</li>
                      <li>• Auction ends: {formatCountdown(listing.endsAt)}</li>
                      <li>• Winner pays highest bid amount</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Signing Preview */}
              {showPreview && (
                <div className="mb-6">
                  <SigningSummary
                    action="bid"
                    amount={{ value: parsedAmount, asset: "USDC" }}
                    details={[
                      { label: "Target Asset", value: `@${listing.username}` },
                      { label: "Listing ID", value: listing.id.slice(0, 8) },
                      { label: "Valid Until", value: formatCountdown(listing.endsAt) },
                    ]}
                    expiry={listing.endsAt}
                  />
                </div>
              )}

              {/* CTA */}
              {!showPreview ? (
                <button
                  onClick={() => setShowPreview(true)}
                  type="button"
                  disabled={!isValid || bidState === "loading"}
                    className={`w-full py-4 rounded-xl font-black text-base tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                    isValid
                      ? "bg-indigo-500 text-white hover:bg-indigo-400 shadow-[0_12px_40px_-15px_rgba(99,102,241,0.6)]"
                      : "bg-white/5 text-neutral-600 cursor-not-allowed"
                  }`}
                >
                  Review Bid →
                </button>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowPreview(false)}
                    type="button"
                    disabled={bidState === "loading"}
                    className="flex-1 py-4 bg-white/5 text-neutral-400 font-bold rounded-xl hover:bg-white/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleConfirm}
                    type="button"
                    disabled={bidState === "loading"}
                    className="flex-[2] py-4 bg-indigo-500 text-white font-black rounded-xl hover:bg-indigo-400 shadow-lg transition-all flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                  >
                    {bidState === "loading" ? (
                      <>
                        <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Signing...
                      </>
                    ) : (
                      "Sign & Pay"
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
