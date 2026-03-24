"use client";

import { useState } from "react";
import type { InvoiceRow, RowError } from "@/utils/csvParser";

type ReviewTableProps = {
  rows: InvoiceRow[];
  errors: RowError[];
  onUpdateRow: (index: number, field: keyof InvoiceRow, value: string) => void;
  onRemoveRow: (index: number) => void;
  onGenerate: () => void;
  onBack: () => void;
  getRowErrors: (index: number) => RowError[];
  hasErrors: boolean;
};

export function ReviewTable({
  rows,
  errors,
  onUpdateRow,
  onRemoveRow,
  onGenerate,
  onBack,
  getRowErrors,
  hasErrors,
}: ReviewTableProps) {
  const [editingCell, setEditingCell] = useState<{ row: number; field: keyof InvoiceRow } | null>(null);

  const errorCount = errors.length;
  const totalValue = rows.reduce((sum, r) => {
    const n = Number(r.amount);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight">Review Invoices</h2>
          <p className="text-neutral-500 text-sm mt-1">
            {rows.length} row{rows.length !== 1 ? "s" : ""} parsed · Total value:{" "}
            <span className="text-white font-bold">{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="px-5 py-2.5 bg-white/5 text-neutral-400 font-bold rounded-xl border border-white/5 hover:bg-white/10 transition text-sm"
          >
            ← Back
          </button>
          <button
            onClick={onGenerate}
            disabled={hasErrors || rows.length === 0}
            className={`
              px-6 py-2.5 font-bold rounded-xl text-sm transition
              ${
                hasErrors || rows.length === 0
                  ? "bg-neutral-800 text-neutral-600 cursor-not-allowed"
                  : "bg-indigo-500 text-white hover:bg-indigo-400 shadow-lg shadow-indigo-500/20 hover:scale-105 active:scale-95"
              }
            `}
          >
            Generate {rows.length} Link{rows.length !== 1 ? "s" : ""} ⚡
          </button>
        </div>
      </div>

      {/* Error banner */}
      {errorCount > 0 && (
        <div className="px-5 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
          <span className="text-red-400 text-lg">⚠</span>
          <div>
            <p className="text-red-400 font-bold text-sm">
              {errorCount} validation error{errorCount !== 1 ? "s" : ""} found
            </p>
            <p className="text-red-400/60 text-xs mt-0.5">Fix or remove the highlighted rows to continue.</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-3xl bg-black/40 border border-white/5 backdrop-blur-2xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead>
              <tr className="text-[9px] font-black text-neutral-600 uppercase tracking-widest border-b border-white/5">
                <th className="px-6 py-5 w-12">#</th>
                <th className="px-6 py-5">Destination</th>
                <th className="px-6 py-5">Amount</th>
                <th className="px-6 py-5">Asset</th>
                <th className="px-6 py-5">Memo</th>
                <th className="px-6 py-5 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row, i) => {
                const rowErrors = getRowErrors(i);
                const hasRowError = rowErrors.length > 0;
                const errorFields = new Set(rowErrors.map((e) => e.field));

                return (
                  <tr
                    key={i}
                    className={`transition group ${hasRowError ? "bg-red-500/[0.03]" : "hover:bg-white/[0.02]"}`}
                  >
                    <td className="px-6 py-4">
                      <span className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-[10px] text-neutral-500 font-mono">
                        {i + 1}
                      </span>
                    </td>
                    {(["destination", "amount", "asset", "memo"] as const).map((field) => {
                      const isEditing = editingCell?.row === i && editingCell.field === field;
                      const fieldHasError = errorFields.has(field);
                      const errorMsg = rowErrors.find((e) => e.field === field)?.message;

                      return (
                        <td key={field} className="px-6 py-4 relative">
                          {isEditing ? (
                            field === "asset" ? (
                              <select
                                autoFocus
                                value={row[field]}
                                onChange={(e) => onUpdateRow(i, field, e.target.value)}
                                onBlur={() => setEditingCell(null)}
                                className="w-full bg-neutral-800 border border-indigo-500/30 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              >
                                <option value="USDC">USDC</option>
                                <option value="XLM">XLM</option>
                              </select>
                            ) : (
                              <input
                                autoFocus
                                type={field === "amount" ? "number" : "text"}
                                value={row[field]}
                                onChange={(e) => onUpdateRow(i, field, e.target.value)}
                                onBlur={() => setEditingCell(null)}
                                onKeyDown={(e) => e.key === "Enter" && setEditingCell(null)}
                                className="w-full bg-neutral-800 border border-indigo-500/30 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            )
                          ) : (
                            <div
                              onClick={() => setEditingCell({ row: i, field })}
                              className={`
                                cursor-pointer px-3 py-2 rounded-lg text-sm font-medium transition
                                ${fieldHasError ? "bg-red-500/10 border border-red-500/20 text-red-400" : "hover:bg-white/5 text-neutral-300"}
                                ${field === "destination" ? "font-mono text-xs" : ""}
                              `}
                              title={errorMsg || "Click to edit"}
                            >
                              {row[field] || <span className="text-neutral-700 italic">empty</span>}
                              {fieldHasError && (
                                <p className="text-[10px] text-red-400/80 mt-1">{errorMsg}</p>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-6 py-4">
                      <button
                        onClick={() => onRemoveRow(i)}
                        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/20 text-neutral-600 hover:text-red-400 flex items-center justify-center transition opacity-0 group-hover:opacity-100"
                        title="Remove row"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-neutral-600 font-bold">No rows to display.</p>
            <button onClick={onBack} className="text-indigo-400 underline text-sm mt-2">
              Upload a new file
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
