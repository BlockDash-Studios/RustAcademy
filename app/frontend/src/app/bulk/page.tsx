"use client";

import Link from "next/link";
import { NetworkBadge } from "@/components/NetworkBadge";
import { useBulkInvoice } from "@/hooks/useBulkInvoice";
import { CSVDropZone } from "@/components/bulk/CSVDropZone";
import { ReviewTable } from "@/components/bulk/ReviewTable";
import { BatchProgress } from "@/components/bulk/BatchProgress";
import { BatchSuccess } from "@/components/bulk/BatchSuccess";

export default function BulkInvoicing() {
  const {
    step,
    rows,
    errors,
    hasErrors,
    generatedLinks,
    progress,
    parseFile,
    removeRow,
    updateRow,
    getRowErrors,
    generateBatch,
    downloadCSV,
    reset,
  } = useBulkInvoice();

  return (
    <div className="relative min-h-screen text-white selection:bg-indigo-500/30 overflow-x-hidden">
      <NetworkBadge />

      {/* Background glows */}
      <div className="fixed top-[-20%] left-[-30%] w-[60%] h-[60%] bg-indigo-500/10 blur-[120px] rounded-full" />
      <div className="fixed bottom-[-20%] right-[-30%] w-[50%] h-[50%] bg-purple-500/5 blur-[100px] rounded-full" />

      {/* Sidebar */}
      <aside className="hidden md:flex w-72 h-screen fixed left-0 top-0 border-r border-white/5 bg-black/20 backdrop-blur-3xl flex-col z-20">
        <nav className="flex-1 px-4 py-20 space-y-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-4 py-3 text-neutral-500 hover:text-white hover:bg-white/5 rounded-2xl font-semibold"
          >
            <span>📊</span> Dashboard
          </Link>
          <Link
            href="/generator"
            className="flex items-center gap-3 px-4 py-3 text-neutral-500 hover:text-white hover:bg-white/5 rounded-2xl font-semibold"
          >
            <span>⚡</span> Link Generator
          </Link>
          <Link
            href="/bulk"
            className="flex items-center gap-3 px-4 py-3 bg-white/5 text-white rounded-2xl font-bold border border-white/5 shadow-inner"
          >
            <span className="text-indigo-400">📦</span> Bulk Invoicing
          </Link>
        </nav>
      </aside>

      {/* Main content */}
      <main className="relative z-10 px-4 sm:px-6 md:px-12 pt-10 md:ml-72">
        {/* Header */}
        <header className="mb-10 sm:mb-16 max-w-3xl">
          <nav className="flex items-center gap-2 text-xs font-black text-neutral-600 uppercase tracking-widest mb-4">
            <span>Services</span>
            <span>/</span>
            <span className="text-neutral-400">Bulk Invoicing</span>
          </nav>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight mb-4">
            Bulk Invoice
            <br />
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Generator.
            </span>
          </h1>

          <p className="text-neutral-500 text-lg max-w-xl">
            Upload a CSV with payment details, review & edit, then generate all your payment links in one batch.
          </p>
        </header>

        {/* Step indicator */}
        <div className="flex items-center gap-4 mb-12 max-w-xl">
          {(["upload", "review", "processing", "success"] as const).map((s, i) => {
            const labels = ["Upload", "Review", "Generate", "Done"];
            const icons = ["📤", "📋", "⚡", "✅"];
            const isActive = s === step;
            const isPast =
              ["upload", "review", "processing", "success"].indexOf(step) >
              ["upload", "review", "processing", "success"].indexOf(s);

            return (
              <div key={s} className="flex items-center gap-3 flex-1">
                <div
                  className={`
                    w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all
                    ${isActive ? "bg-indigo-500/20 border border-indigo-500/30 scale-110" : ""}
                    ${isPast ? "bg-green-500/10 border border-green-500/20" : ""}
                    ${!isActive && !isPast ? "bg-white/5 border border-white/5" : ""}
                  `}
                >
                  {isPast ? "✓" : icons[i]}
                </div>
                <span
                  className={`text-xs font-bold tracking-wide hidden sm:block ${
                    isActive ? "text-white" : isPast ? "text-green-400/60" : "text-neutral-600"
                  }`}
                >
                  {labels[i]}
                </span>
                {i < 3 && (
                  <div
                    className={`flex-1 h-px ${isPast ? "bg-green-500/30" : "bg-white/5"}`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Dynamic content */}
        <div className="pb-20">
          {step === "upload" && <CSVDropZone onFileSelected={parseFile} />}

          {step === "review" && (
            <ReviewTable
              rows={rows}
              errors={errors}
              onUpdateRow={updateRow}
              onRemoveRow={removeRow}
              onGenerate={generateBatch}
              onBack={reset}
              getRowErrors={getRowErrors}
              hasErrors={hasErrors}
            />
          )}

          {step === "processing" && (
            <BatchProgress
              progress={progress}
              total={rows.length}
              generatedLinks={generatedLinks}
            />
          )}

          {step === "success" && (
            <BatchSuccess
              generatedLinks={generatedLinks}
              onDownload={downloadCSV}
              onReset={reset}
            />
          )}
        </div>
      </main>
    </div>
  );
}
