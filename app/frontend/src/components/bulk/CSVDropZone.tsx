"use client";

import { useRef, useState, useCallback } from "react";

type CSVDropZoneProps = {
  onFileSelected: (file: File) => void;
};

export function CSVDropZone({ onFileSelected }: CSVDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      if (!file.name.endsWith(".csv")) {
        setError("Please upload a .csv file.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("File is too large. Max 5 MB.");
        return;
      }
      setSelectedFile(file.name);
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onClick = () => inputRef.current?.click();

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onKeyDown={(e) => e.key === "Enter" && onClick()}
        className={`
          relative group cursor-pointer rounded-3xl p-12 sm:p-16
          border-2 border-dashed transition-all duration-300 ease-out
          flex flex-col items-center justify-center text-center
          ${
            isDragging
              ? "border-indigo-400 bg-indigo-500/10 scale-[1.02]"
              : "border-white/10 bg-neutral-900/30 hover:border-indigo-500/30 hover:bg-neutral-900/50"
          }
        `}
      >
        {/* Glow */}
        <div
          className={`
            absolute -inset-1 rounded-3xl blur-xl transition-opacity duration-500
            ${isDragging ? "opacity-100 bg-indigo-500/20" : "opacity-0 group-hover:opacity-50 bg-indigo-500/10"}
          `}
        />

        <div className="relative z-10 flex flex-col items-center gap-6">
          {/* Icon */}
          <div
            className={`
              w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300
              ${isDragging ? "bg-indigo-500/20 scale-110" : "bg-white/5 group-hover:bg-indigo-500/10"}
            `}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className={`transition-colors ${isDragging ? "text-indigo-400" : "text-neutral-500 group-hover:text-indigo-400"}`}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {selectedFile ? (
            <>
              <div className="flex items-center gap-3 px-5 py-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                <span className="text-indigo-400 text-sm">📄</span>
                <span className="text-white font-bold text-sm">{selectedFile}</span>
                <span className="text-green-400 text-xs font-bold">✓</span>
              </div>
              <p className="text-xs text-neutral-500">Parsing complete. Proceeding to review...</p>
            </>
          ) : (
            <>
              <div>
                <p className="text-white font-bold text-lg mb-1">
                  {isDragging ? "Drop your CSV here" : "Drag & drop your CSV"}
                </p>
                <p className="text-neutral-500 text-sm">
                  or <span className="text-indigo-400 underline underline-offset-2">click to browse</span>
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-3 text-[10px] text-neutral-600 font-bold uppercase tracking-widest">
                <span className="px-3 py-1.5 bg-white/5 rounded-lg border border-white/5">destination</span>
                <span className="px-3 py-1.5 bg-white/5 rounded-lg border border-white/5">amount</span>
                <span className="px-3 py-1.5 bg-white/5 rounded-lg border border-white/5">asset</span>
                <span className="px-3 py-1.5 bg-white/5 rounded-lg border border-white/5">memo</span>
              </div>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          id="csv-upload-input"
          type="file"
          accept=".csv"
          onChange={onChange}
          className="hidden"
        />
      </div>

      {error && (
        <div className="mt-4 px-5 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold text-center">
          {error}
        </div>
      )}

      {/* Template hint */}
      <p className="text-center text-neutral-600 text-xs mt-6">
        Need a template?{" "}
        <button
          onClick={(e) => {
            e.stopPropagation();
            const csv = "destination,amount,asset,memo\nGD2P...5H2W,50.00,USDC,Invoice #001\nGD1R...3K9L,125.00,XLM,Consulting Fee";
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "quickex-bulk-template.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="text-indigo-400 underline underline-offset-2 hover:text-indigo-300 transition"
        >
          Download CSV template
        </button>
      </p>
    </div>
  );
}
