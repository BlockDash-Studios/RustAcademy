"use client";

import { AlertTriangle, CheckCircle2, Clock, Loader2, ShieldCheck, Wallet } from "lucide-react";

export type SigningAction = "bid" | "refund" | "dispute" | "listing" | "purchase";

/** Final outcome of the transaction so the summary can reflect recovery steps. */
export type SigningStatus = "pending" | "confirmed" | "rejected" | "expired" | "timeout";

interface SigningFee {
  value: number;
  asset: string;
  label?: string;
  percentage?: number;
  thresholdPercent?: number;
  isHigh?: boolean;
}

interface SigningSummaryProps {
  action: SigningAction;
  amount?: {
    value: number;
    asset: string;
  };
  details: {
    label: string;
    value: string;
  }[];
  expiry?: Date;
  network?: string;
  targetNetwork?: string;
  fee?: SigningFee;
  status?: SigningStatus;
  recoveryAction?: string;
}

export function SigningSummary({
  action,
  amount,
  details,
  expiry,
  network = "Stellar Testnet",
  targetNetwork = "Stellar Testnet",
  fee,
  status = "pending",
  recoveryAction,
}: SigningSummaryProps) {
  const isNetworkMismatch = network !== targetNetwork;
  const isExpired = expiry ? expiry.getTime() < Date.now() : false;

  const feeThreshold = fee?.thresholdPercent ?? 3;
  const feePercentage = fee?.percentage ?? (fee && amount ? (amount.value > 0 ? (fee.value / amount.value) * 100 : 0) : undefined);
  const isHighFee = Boolean(fee?.isHigh || (feePercentage !== undefined && feePercentage >= feeThreshold));

  const actionLabels: Record<SigningAction, string> = {
    bid: "Place Auction Bid",
    refund: "Request Refund",
    dispute: "Open Dispute",
    listing: "Create Listing",
    purchase: "Buy Now",
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Action Header */}
      <div className="flex items-center gap-3 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
        <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
          <ShieldCheck size={20} />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest font-black text-indigo-400/70">
            Secure Signing Request
          </p>
          <h3 className="text-lg font-black text-white">{actionLabels[action]}</h3>
        </div>
      </div>

      {/* Main Summary Card */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        {amount && (
          <div className="p-6 text-center border-b border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
            <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-1">
              Transaction Value
            </p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-3xl font-black text-white">{amount.value}</span>
              <span className="text-lg font-bold text-indigo-400">{amount.asset}</span>
            </div>
          </div>
        )}

        <div className="p-4 space-y-3">
          {details.map((detail, i) => (
            <div key={i} className="flex justify-between items-center text-sm">
              <span className="text-neutral-500 font-medium">{detail.label}</span>
              <span className="text-white font-bold font-mono text-xs">{detail.value}</span>
            </div>
          ))}

          {fee && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-neutral-500 font-medium">{fee.label ?? "Estimated Fee"}</span>
              <span className={`font-bold ${isHighFee ? "text-red-400" : "text-neutral-300"}`}>
                {fee.value} {fee.asset}
                {feePercentage !== undefined ? ` (${feePercentage.toFixed(1)}%)` : ""}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center text-sm pt-2 border-t border-white/5">
            <span className="text-neutral-500 font-medium flex items-center gap-1.5">
              <Wallet size={14} /> Network
            </span>
            <span className={`font-bold ${isNetworkMismatch ? "text-red-400" : "text-neutral-300"}`}>
              {network}
            </span>
          </div>

          {expiry && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-neutral-500 font-medium flex items-center gap-1.5">
                <Clock size={14} /> Quote Expiry
              </span>
              <span className={`font-bold ${isExpired ? "text-red-400" : "text-emerald-400"}`}>
                {isExpired ? "Expired" : "Valid"}
              </span>
            </div>
          )}
        </div>
      </div>

      {(isNetworkMismatch || isExpired || isHighFee) && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 text-red-400 font-black text-xs uppercase tracking-tight">
            <AlertTriangle size={16} /> Attention Required
          </div>
          <ul className="text-xs text-red-400/80 space-y-1 list-disc list-inside">
            {isNetworkMismatch && (
              <li>Your wallet is on {network}, but this action requires {targetNetwork}.</li>
            )}
            {isExpired && (
              <li>This transaction payload has expired. Please refresh the quote.</li>
            )}
            {isHighFee && (
              <li>The fee is above the safe threshold. Confirm the route and source asset before approving.</li>
            )}
          </ul>
        </div>
      )}

      {!isNetworkMismatch && !isExpired && !isHighFee && status === "pending" && (
        <p className="text-[10px] text-neutral-500 text-center px-4 leading-relaxed italic">
          Verify the details above match your intention. This summary is generated from the exact payload that will be sent to your wallet.
        </p>
      )}

      {/* Final status banner with recovery guidance */}
      {status !== "pending" && (
        <div
          role="status"
          className={`p-4 rounded-2xl border space-y-1 ${
            status === "confirmed"
              ? "bg-emerald-500/10 border-emerald-500/30"
              : status === "timeout"
                ? "bg-amber-500/10 border-amber-500/30"
                : "bg-red-500/10 border-red-500/30"
          }`}
        >
          <div className="flex items-center gap-2 font-black text-xs uppercase tracking-tight">
            {status === "confirmed" ? (
              <CheckCircle2 size={16} className="text-emerald-400" />
            ) : status === "timeout" ? (
              <Loader2 size={16} className="text-amber-400" />
            ) : (
              <AlertTriangle size={16} className="text-red-400" />
            )}
            <span
              className={
                status === "confirmed"
                  ? "text-emerald-400"
                  : status === "timeout"
                    ? "text-amber-400"
                    : "text-red-400"
              }
            >
              {status === "confirmed"
                ? "Transaction confirmed"
                : status === "rejected"
                  ? "Signature rejected"
                  : status === "expired"
                    ? "Payment window expired"
                    : "Broadcast timed out"}
            </span>
          </div>
          <p className="text-xs text-red-200/90 leading-relaxed">
            {recoveryAction ??
              (status === "confirmed"
                ? "Your payment has been accepted by the network."
                : status === "rejected"
                  ? "Open your wallet and approve the signature request to try again."
                  : status === "expired"
                    ? "Refresh the quote to get a new payload, then retry."
                    : "The signed payload is cached. Retrying is safe and will not duplicate the payment.")}
          </p>
        </div>
      )}
    </div>
  );
}
