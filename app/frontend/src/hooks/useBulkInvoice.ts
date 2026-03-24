"use client";

import { useState, useCallback } from "react";
import { parseCSV, type InvoiceRow, type RowError } from "@/utils/csvParser";

export type BulkStep = "upload" | "review" | "processing" | "success";

export type GeneratedLink = {
  index: number;
  destination: string;
  amount: string;
  asset: string;
  memo: string;
  link: string;
};

export function useBulkInvoice() {
  const [step, setStep] = useState<BulkStep>("upload");
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [errors, setErrors] = useState<RowError[]>([]);
  const [generatedLinks, setGeneratedLinks] = useState<GeneratedLink[]>([]);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");

  const parseFile = useCallback(async (file: File) => {
    setFileName(file.name);
    const text = await file.text();
    const result = parseCSV(text);
    setRows(result.validRows);
    setErrors(result.errors);
    if (result.validRows.length > 0) {
      setStep("review");
    }
  }, []);

  const removeRow = useCallback((index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setErrors((prev) =>
      prev
        .filter((e) => e.row !== index + 1)
        .map((e) => (e.row > index + 1 ? { ...e, row: e.row - 1 } : e))
    );
  }, []);

  const updateRow = useCallback((index: number, field: keyof InvoiceRow, value: string) => {
    setRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    // Clear errors for the updated field
    setErrors((prev) => prev.filter((e) => !(e.row === index + 1 && e.field === field)));
  }, []);

  const getRowErrors = useCallback(
    (rowIndex: number) => errors.filter((e) => e.row === rowIndex + 1),
    [errors]
  );

  const hasErrors = errors.length > 0;

  const revalidate = useCallback(() => {
    const newErrors: RowError[] = [];
    rows.forEach((row, i) => {
      if (!row.destination) {
        newErrors.push({ row: i + 1, field: "destination", message: "Destination is required." });
      }
      if (!row.amount) {
        newErrors.push({ row: i + 1, field: "amount", message: "Amount is required." });
      } else {
        const num = Number(row.amount);
        if (isNaN(num)) newErrors.push({ row: i + 1, field: "amount", message: "Invalid number." });
        else if (num <= 0) newErrors.push({ row: i + 1, field: "amount", message: "Must be > 0." });
      }
      if (!["USDC", "XLM"].includes(row.asset.toUpperCase())) {
        newErrors.push({ row: i + 1, field: "asset", message: "Use USDC or XLM." });
      }
    });
    setErrors(newErrors);
    return newErrors.length === 0;
  }, [rows]);

  const generateBatch = useCallback(async () => {
    if (!revalidate()) return;

    setStep("processing");
    setProgress(0);
    setGeneratedLinks([]);

    const links: GeneratedLink[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Simulate link generation with a delay
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 200));

      const id = Math.random().toString(36).substring(2, 10);
      links.push({
        index: i,
        destination: row.destination,
        amount: row.amount,
        asset: row.asset,
        memo: row.memo,
        link: `https://quickex.to/pay/${id}`,
      });

      setGeneratedLinks([...links]);
      setProgress(Math.round(((i + 1) / rows.length) * 100));
    }

    setStep("success");
  }, [rows, revalidate]);

  const downloadCSV = useCallback(() => {
    const header = "destination,amount,asset,memo,link";
    const body = generatedLinks
      .map(
        (l) =>
          `"${l.destination}","${l.amount}","${l.asset}","${l.memo}","${l.link}"`
      )
      .join("\n");
    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quickex-batch-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [generatedLinks]);

  const reset = useCallback(() => {
    setStep("upload");
    setRows([]);
    setErrors([]);
    setGeneratedLinks([]);
    setProgress(0);
    setFileName("");
  }, []);

  return {
    step,
    rows,
    errors,
    hasErrors,
    generatedLinks,
    progress,
    fileName,
    parseFile,
    removeRow,
    updateRow,
    getRowErrors,
    revalidate,
    generateBatch,
    downloadCSV,
    reset,
  };
}
