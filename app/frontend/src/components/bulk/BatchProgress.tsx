"use client";

import type { GeneratedLink } from "@/hooks/useBulkInvoice";

type BatchProgressProps = {
  progress: number;
  total: number;
  generatedLinks: GeneratedLink[];
};

export function BatchProgress({ progress, total, generatedLinks }: BatchProgressProps) {
  const completed = generatedLinks.length;

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center justify-center py-16 gap-10">
      {/* Animated icon */}
      <div className="relative">
        <div className="w-28 h-28 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="text-indigo-400 animate-pulse">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="absolute -inset-4 bg-indigo-500/10 blur-2xl rounded-full animate-pulse" />
      </div>

      {/* Title */}
      <div className="text-center">
        <h2 className="text-3xl font-black tracking-tight mb-2">Generating Links</h2>
        <p className="text-neutral-500 text-sm">
          Processing {completed} of {total} invoices...
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full space-y-3">
        <div className="w-full h-3 bg-neutral-900/50 rounded-full border border-white/5 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300 ease-out relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_infinite] rounded-full" />
          </div>
        </div>
        <div className="flex justify-between text-xs font-bold text-neutral-600">
          <span>{completed} completed</span>
          <span className="text-indigo-400">{progress}%</span>
        </div>
      </div>

      {/* Live counter */}
      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="p-5 rounded-2xl bg-neutral-900/40 border border-white/5 text-center">
          <p className="text-3xl font-black text-white">{completed}</p>
          <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest mt-1">Generated</p>
        </div>
        <div className="p-5 rounded-2xl bg-neutral-900/40 border border-white/5 text-center">
          <p className="text-3xl font-black text-neutral-600">{total - completed}</p>
          <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest mt-1">Remaining</p>
        </div>
      </div>
    </div>
  );
}
