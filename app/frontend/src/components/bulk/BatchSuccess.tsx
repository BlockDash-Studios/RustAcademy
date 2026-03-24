"use client";

import type { GeneratedLink } from "@/hooks/useBulkInvoice";

type BatchSuccessProps = {
  generatedLinks: GeneratedLink[];
  onDownload: () => void;
  onReset: () => void;
};

export function BatchSuccess({ generatedLinks, onDownload, onReset }: BatchSuccessProps) {
  const totalValue = generatedLinks.reduce((sum, l) => sum + Number(l.amount), 0);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8">
      {/* Success banner */}
      <div className="text-center py-8">
        <div className="w-20 h-20 rounded-3xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-6">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-green-400">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="text-4xl font-black tracking-tight mb-2">Batch Complete!</h2>
        <p className="text-neutral-500 text-sm">
          All {generatedLinks.length} payment links have been generated successfully.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-6 rounded-2xl bg-neutral-900/40 border border-white/5 text-center">
          <p className="text-3xl font-black text-white">{generatedLinks.length}</p>
          <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest mt-1">Links Generated</p>
        </div>
        <div className="p-6 rounded-2xl bg-neutral-900/40 border border-white/5 text-center">
          <p className="text-3xl font-black text-white">
            {totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest mt-1">Total Value</p>
        </div>
        <div className="p-6 rounded-2xl bg-green-500/10 border border-green-500/20 text-center">
          <p className="text-3xl font-black text-green-400">100%</p>
          <p className="text-[10px] text-green-400/60 font-bold uppercase tracking-widest mt-1">Success Rate</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={onDownload}
          className="px-8 py-4 bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 hover:bg-indigo-400 hover:scale-105 active:scale-95 transition flex items-center justify-center gap-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Download All as CSV
        </button>
        <button
          onClick={onReset}
          className="px-8 py-4 bg-white/5 text-neutral-400 font-bold rounded-xl border border-white/5 hover:bg-white/10 hover:text-white transition"
        >
          Generate More
        </button>
      </div>

      {/* Links preview table */}
      <div className="rounded-3xl bg-black/40 border border-white/5 backdrop-blur-2xl shadow-2xl overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-white/5">
          <h3 className="text-lg font-black">Generated Links</h3>
          <p className="text-xs text-neutral-600 mt-1">Click any link to copy</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[650px]">
            <thead>
              <tr className="text-[9px] font-black text-neutral-600 uppercase tracking-widest border-b border-white/5">
                <th className="px-6 py-4">#</th>
                <th className="px-6 py-4">Destination</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {generatedLinks.map((link, i) => (
                <tr key={i} className="hover:bg-white/[0.02] transition">
                  <td className="px-6 py-4">
                    <span className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-[10px] text-neutral-500 font-mono">
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-neutral-400 max-w-40 truncate">
                    {link.destination}
                  </td>
                  <td className="px-6 py-4 font-bold">
                    {link.amount} <span className="text-neutral-500 text-xs">{link.asset}</span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => navigator.clipboard.writeText(link.link)}
                      className="text-indigo-400 hover:text-indigo-300 text-sm font-mono underline underline-offset-2 transition truncate block max-w-60"
                      title="Click to copy"
                    >
                      {link.link}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
