"use client";

import QRCode from "react-qr-code";

export function QRPreview({ value }: { value?: string }) {
  const isValid = Boolean(value);

  return (
    <div
      role="img"
      aria-label={
        isValid
          ? "QR code preview for the current payment request."
          : "QR code preview placeholder. Complete the payment details to generate it."
      }
      className="relative group"
    >
      <div className="absolute -inset-10 rounded-full bg-indigo-500/10 blur-[60px] opacity-50 transition-opacity group-hover:opacity-80" />

      <div className="relative aspect-square w-full overflow-hidden rounded-[3rem] border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.02] p-1 shadow-2xl transition-all duration-500 group-hover:scale-[1.02] backdrop-blur-3xl">
        <div className="absolute inset-0 h-1/2 w-full -translate-y-full bg-gradient-to-b from-transparent via-indigo-500/5 to-transparent hover:animate-[scan_3s_linear_infinite]" />

        <div className="flex h-full w-full flex-col items-center justify-center rounded-[2.8rem] border border-white/5 bg-black/40 p-12">
          <div className="relative rounded-3xl bg-white p-6 shadow-[0_0_30px_rgba(255,255,255,0.05)]">
            {isValid ? (
              <QRCode value={value ?? ""} size={200} bgColor="white" fgColor="black" />
            ) : (
              <div className="flex h-48 w-48 flex-col items-center justify-center gap-4 rounded-2xl border-4 border-dashed border-neutral-300/60">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-black">
                  <div className="h-6 w-6 animate-pulse rounded-sm bg-indigo-500" />
                </div>
                <div className="grid grid-cols-2 gap-1 opacity-30">
                  <div className="h-4 w-4 rounded-sm bg-black" />
                  <div className="h-4 w-4 rounded-sm bg-black" />
                  <div className="h-4 w-4 rounded-sm bg-black" />
                  <div className="h-4 w-4 rounded-sm bg-black" />
                </div>
              </div>
            )}
          </div>

          <div className="mt-10 space-y-2 text-center">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-indigo-300">
              Ready to Scan
            </p>
            <p className="text-sm font-medium text-neutral-300">
              Point your wallet camera here
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
