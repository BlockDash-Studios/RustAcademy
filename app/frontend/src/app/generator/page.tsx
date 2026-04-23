"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { NetworkBadge } from "@/components/NetworkBadge";
import { QRPreview } from "@/components/QRPreview";
import { useFocusPreview } from "@/hooks/useFocusPreview";
import { useApi } from "@/hooks/useApi";
import { getQuickexApiBase } from "@/lib/api";

type ValidationErrors = Partial<
  Record<"amount" | "asset" | "destination", string>
>;

type VerifiedAsset = {
  code: string;
  type: string;
  issuer: string | null;
  verified: boolean;
  decimals: number;
};

type PathRow = {
  sourceAmount: string;
  sourceAsset: string;
  destinationAmount: string;
  destinationAsset: string;
  hopCount: number;
  pathHops: string[];
  rateDescription: string;
};

type PathPreviewResponse = {
  paths: PathRow[];
  horizonUrl: string;
};

type LinkMetadataSuccess = {
  success: true;
  data: {
    canonical: string;
    amount: string;
    asset: string;
    destination?: string | null;
    memo: string | null;
    metadata?: Record<string, unknown>;
  };
};

type ComposeSuccess = {
  success: true;
  unsignedXdr?: string;
  feeEstimate?: {
    totalFeeXLM?: string;
    totalFee?: string;
  };
  resourceEstimate?: Record<string, number>;
  simulationLatencyMs?: number;
};

type ComposeError = {
  success: false;
  userMessage?: string;
  error?: string;
};

export default function Generator() {
  useFocusPreview();

  const apiBase = useMemo(() => getQuickexApiBase(), []);
  const { data, error, loading, callApi } = useApi<LinkMetadataSuccess>();

  const [form, setForm] = useState({
    amount: "",
    destination: "",
    memo: "",
  });
  const [recipientAssetCode, setRecipientAssetCode] = useState("USDC");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sourceAssetCodes, setSourceAssetCodes] = useState<Set<string>>(
    () => new Set(["XLM", "USDC"]),
  );

  const [verifiedAssets, setVerifiedAssets] = useState<VerifiedAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const [pathLoading, setPathLoading] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const [pathData, setPathData] = useState<PathPreviewResponse | null>(null);

  const [preflightAccount, setPreflightAccount] = useState("");
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightResult, setPreflightResult] = useState<
    ComposeSuccess | ComposeError | null
  >(null);
  const [preflightUnavailable, setPreflightUnavailable] = useState<
    string | null
  >(null);

  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [errors, setErrors] = useState<ValidationErrors>({});

  useEffect(() => {
    if (!copyStatus) {
      return;
    }

    const timer = window.setTimeout(() => setCopyStatus(null), 3000);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setAssetsLoading(true);
      setAssetsError(null);

      try {
        const response = await fetch(`${apiBase}/stellar/verified-assets`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const json = (await response.json()) as { assets: VerifiedAsset[] };
        if (!cancelled) {
          setVerifiedAssets(json.assets ?? []);
        }
      } catch {
        if (!cancelled) {
          setAssetsError("Could not load verified assets.");
          setVerifiedAssets([]);
        }
      } finally {
        if (!cancelled) {
          setAssetsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  const recipientRef = useMemo(() => {
    const asset = verifiedAssets.find(
      (item) => item.code.toUpperCase() === recipientAssetCode.toUpperCase(),
    );

    return asset
      ? { code: asset.code, issuer: asset.issuer ?? undefined }
      : { code: recipientAssetCode };
  }, [recipientAssetCode, verifiedAssets]);

  const sourceRefsForPreview = useMemo(() => {
    const refs: Array<{ code: string; issuer?: string }> = [];

    for (const code of sourceAssetCodes) {
      const asset = verifiedAssets.find(
        (item) => item.code.toUpperCase() === code.toUpperCase(),
      );

      if (asset) {
        refs.push({
          code: asset.code,
          issuer: asset.issuer ?? undefined,
        });
      }
    }

    return refs;
  }, [sourceAssetCodes, verifiedAssets]);

  const fetchPathPreview = useCallback(async () => {
    if (
      !advancedOpen ||
      !form.amount ||
      Number.isNaN(Number(form.amount)) ||
      sourceRefsForPreview.length === 0
    ) {
      setPathData(null);
      return;
    }

    setPathLoading(true);
    setPathError(null);

    try {
      const response = await fetch(`${apiBase}/stellar/path-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationAmount: form.amount.trim(),
          destinationAsset: recipientRef,
          sourceAssets: sourceRefsForPreview,
        }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof json?.message === "string"
            ? json.message
            : "Path preview failed.",
        );
      }

      setPathData(json as PathPreviewResponse);
    } catch (reason) {
      setPathError(
        reason instanceof Error ? reason.message : "Path preview failed.",
      );
      setPathData(null);
    } finally {
      setPathLoading(false);
    }
  }, [
    advancedOpen,
    apiBase,
    form.amount,
    recipientRef,
    sourceRefsForPreview,
  ]);

  useEffect(() => {
    if (!advancedOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      void fetchPathPreview();
    }, 450);

    return () => window.clearTimeout(timer);
  }, [advancedOpen, fetchPathPreview]);

  const validate = useCallback(() => {
    const nextErrors: ValidationErrors = {};

    if (!form.amount) {
      nextErrors.amount = "Amount is required.";
    } else if (Number.isNaN(Number(form.amount))) {
      nextErrors.amount = "Enter a valid number.";
    }

    if (!form.destination) {
      nextErrors.destination = "Destination public key is required.";
    }

    if (!recipientAssetCode) {
      nextErrors.asset = "Select the recipient asset.";
    }

    return nextErrors;
  }, [form.amount, form.destination, recipientAssetCode]);

  const linkData = useMemo(() => {
    if (!form.amount || !recipientAssetCode || !form.destination) {
      return "";
    }

    const recipientAsset = verifiedAssets.find(
      (item) => item.code.toUpperCase() === recipientAssetCode.toUpperCase(),
    );

    return JSON.stringify({
      amount: form.amount,
      asset: recipientAssetCode,
      destination: form.destination,
      memo: form.memo,
      ...(advancedOpen && {
        pathPayment: {
          recipientAsset: recipientAsset
            ? {
                code: recipientAsset.code,
                type: recipientAsset.type,
                issuer: recipientAsset.issuer,
              }
            : { code: recipientAssetCode },
          allowedSourceAssets: Array.from(sourceAssetCodes),
        },
      }),
    });
  }, [
    advancedOpen,
    form.amount,
    form.destination,
    form.memo,
    recipientAssetCode,
    sourceAssetCodes,
    verifiedAssets,
  ]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validation = validate();
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }

    void callApi(async () => {
      const response = await fetch(`${apiBase}/links/metadata`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(form.amount),
          asset: recipientAssetCode,
          destination: form.destination,
          memo: form.memo || undefined,
        }),
      });
      const json = await response.json();

      if (!response.ok) {
        const message =
          json?.message ??
          json?.error ??
          `Request failed (${response.status})`;
        throw new Error(
          typeof message === "string" ? message : "Request failed",
        );
      }

      return json as LinkMetadataSuccess;
    });
  };

  const runPreflight = async () => {
    const publicKey = preflightAccount.trim();

    if (!/^G[A-Z0-9]{55}$/.test(publicKey)) {
      setPreflightResult({
        success: false,
        userMessage:
          "Enter a valid 56-character Stellar public key that starts with G.",
      });
      return;
    }

    setPreflightLoading(true);
    setPreflightResult(null);
    setPreflightUnavailable(null);

    try {
      const response = await fetch(`${apiBase}/stellar/soroban-preflight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceAccount: publicKey }),
      });

      const json = (await response.json()) as
        | ComposeSuccess
        | ComposeError
        | {
            message?: string;
            code?: string;
          };
      const responseMessage =
        "message" in json && typeof json.message === "string"
          ? json.message
          : null;

      if (response.status === 503) {
        setPreflightUnavailable(
          responseMessage ??
            "Soroban preflight is not configured on this server.",
        );
        return;
      }

      if (!response.ok) {
        setPreflightResult({
          success: false,
          userMessage: responseMessage ?? "Preflight request failed.",
        });
        return;
      }

      setPreflightResult(json as ComposeSuccess | ComposeError);
    } catch {
      setPreflightResult({
        success: false,
        userMessage: "Network error when calling preflight.",
      });
    } finally {
      setPreflightLoading(false);
    }
  };

  const toggleSource = (code: string) => {
    setSourceAssetCodes((previous) => {
      const next = new Set(previous);

      if (next.has(code)) {
        if (next.size <= 1) {
          return next;
        }
        next.delete(code);
      } else {
        next.add(code);
      }

      return next;
    });
  };

  const handleCanonicalCopy = async () => {
    if (!canonicalPreview) {
      return;
    }

    try {
      await navigator.clipboard.writeText(canonicalPreview);
      setCopyStatus("Canonical parameters copied to the clipboard.");
    } catch {
      setCopyStatus("Copy failed in this browser.");
    }
  };

  const canonicalPreview =
    data?.success === true ? data.data.canonical : null;

  const recipientAssetHelp = errors.asset
    ? "generator-recipient-asset-help generator-asset-error"
    : "generator-recipient-asset-help";
  const sourceAssetsLabel = Array.from(sourceAssetCodes).join(", ");

  return (
    <div className="relative min-h-screen overflow-x-hidden text-white">
      <NetworkBadge />

      <div className="fixed left-[-30%] top-[-20%] h-[60%] w-[60%] bg-indigo-500/10 blur-[120px]" />
      <div className="fixed bottom-[-20%] right-[-30%] h-[50%] w-[50%] bg-purple-500/5 blur-[100px]" />

      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-72 flex-col border-r border-white/5 bg-black/20 backdrop-blur-3xl md:flex">
        <nav
          aria-label="Generator quick navigation"
          className="flex-1 space-y-2 px-4 py-20"
        >
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-2xl px-4 py-3 font-semibold text-neutral-200 transition hover:bg-white/5 hover:text-white"
          >
            <span aria-hidden="true">📊</span>
            Dashboard
          </Link>
          <Link
            href="/generator"
            aria-current="page"
            className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 px-4 py-3 font-bold text-white shadow-inner"
          >
            <span aria-hidden="true" className="text-indigo-300">
              ⚡
            </span>
            Link Generator
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-3 rounded-2xl px-4 py-3 font-semibold text-neutral-200 transition hover:bg-white/5 hover:text-white"
          >
            <span aria-hidden="true">⚙</span>
            Profile Settings
          </Link>
        </nav>
      </aside>

      <main className="relative z-10 px-4 pt-10 sm:px-6 md:ml-72 md:px-12">
        <header className="mb-10 max-w-3xl sm:mb-16">
          <nav
            aria-label="Breadcrumb"
            className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neutral-300"
          >
            <span>Services</span>
            <span aria-hidden="true">/</span>
            <span className="text-neutral-100">Link Generator</span>
          </nav>

          <h1 className="mb-4 text-4xl font-black tracking-tight sm:text-5xl md:text-6xl">
            Create a payment
            <br />
            <span className="bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent">
              request instantly.
            </span>
          </h1>

          <p className="max-w-xl text-lg text-neutral-200">
            Build a payment request that works with a keyboard, reads clearly
            with assistive technology, and optionally supports path payments.
          </p>
        </header>

        <div className="grid max-w-7xl grid-cols-1 gap-12 xl:grid-cols-[1.2fr_0.8fr] xl:gap-20">
          <form className="space-y-12" onSubmit={handleSubmit} noValidate>
            <section aria-labelledby="payment-request-title" className="space-y-6">
              <h2 id="payment-request-title" className="sr-only">
                Payment request details
              </h2>

              <div>
                <label
                  htmlFor="generator-amount"
                  className="ml-1 text-xs font-black uppercase tracking-widest text-neutral-200"
                >
                  Amount recipient receives
                </label>
                <p
                  id="generator-amount-help"
                  className="ml-1 mt-2 text-sm text-neutral-300"
                >
                  Choose the asset below, then enter the amount you want the
                  recipient to receive.
                </p>

                <div className="group relative mt-3">
                  <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 opacity-0 blur transition group-focus-within:opacity-100" />

                  <div className="relative rounded-3xl border border-white/10 bg-neutral-900/50 p-1 shadow-2xl">
                    <input
                      id="generator-amount"
                      type="number"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={form.amount}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      aria-invalid={Boolean(errors.amount)}
                      aria-describedby={
                        errors.amount
                          ? "generator-amount-help generator-amount-error"
                          : "generator-amount-help"
                      }
                      className="w-full bg-transparent p-6 text-3xl font-black placeholder:text-neutral-400 sm:p-8 sm:text-5xl"
                    />

                    <div
                      role="group"
                      aria-label="Quick recipient asset selection"
                      className="absolute right-4 top-1/2 flex max-w-[50%] -translate-y-1/2 flex-wrap justify-end gap-1 rounded-2xl border border-white/5 bg-black/40 p-2 backdrop-blur-xl"
                    >
                      {assetsLoading ? (
                        <span className="px-3 py-2 text-xs text-neutral-300">
                          Loading assets...
                        </span>
                      ) : (
                        verifiedAssets.map((asset) => (
                          <button
                            key={asset.code}
                            type="button"
                            aria-pressed={recipientAssetCode === asset.code}
                            onClick={() => setRecipientAssetCode(asset.code)}
                            className={`rounded-xl px-3 py-2 text-xs transition sm:text-sm ${
                              recipientAssetCode === asset.code
                                ? "bg-white font-black text-black"
                                : "text-neutral-200 hover:text-white"
                            }`}
                          >
                            {asset.code}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {errors.amount && (
                  <p
                    id="generator-amount-error"
                    className="mt-2 text-xs text-red-300"
                  >
                    {errors.amount}
                  </p>
                )}
                {assetsError && (
                  <p className="mt-2 text-xs text-amber-300">{assetsError}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="generator-destination"
                  className="ml-1 text-xs font-black uppercase tracking-widest text-neutral-200"
                >
                  Destination
                </label>
                <p
                  id="generator-destination-help"
                  className="ml-1 mt-2 text-sm text-neutral-300"
                >
                  Paste the receiver&apos;s Stellar public key.
                </p>
                <input
                  id="generator-destination"
                  type="text"
                  placeholder="Receiver public key"
                  value={form.destination}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      destination: event.target.value,
                    }))
                  }
                  aria-invalid={Boolean(errors.destination)}
                  aria-describedby={
                    errors.destination
                      ? "generator-destination-help generator-destination-error"
                      : "generator-destination-help"
                  }
                  className="mt-3 w-full rounded-3xl border border-white/10 bg-neutral-900/30 p-5 font-bold text-white placeholder:text-neutral-400"
                />
                {errors.destination && (
                  <p
                    id="generator-destination-error"
                    className="mt-2 text-xs text-red-300"
                  >
                    {errors.destination}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="generator-memo"
                  className="ml-1 text-xs font-black uppercase tracking-widest text-neutral-200"
                >
                  Memo (optional)
                </label>
                <p
                  id="generator-memo-help"
                  className="ml-1 mt-2 text-sm text-neutral-300"
                >
                  Add a note so the recipient knows what this payment is for.
                </p>
                <input
                  id="generator-memo"
                  type="text"
                  placeholder="What is this payment for?"
                  value={form.memo}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      memo: event.target.value,
                    }))
                  }
                  aria-describedby="generator-memo-help"
                  className="mt-3 w-full rounded-3xl border border-white/10 bg-neutral-900/30 p-5 font-bold text-white placeholder:text-neutral-400"
                />
              </div>

              <section className="space-y-4 rounded-3xl border border-white/10 bg-black/30 p-6">
                <button
                  type="button"
                  aria-expanded={advancedOpen}
                  aria-controls="advanced-settings-panel"
                  onClick={() => setAdvancedOpen((current) => !current)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="text-sm font-black uppercase tracking-widest text-indigo-200">
                    Advanced settings
                  </span>
                  <span className="text-sm text-neutral-200">
                    {advancedOpen ? "Hide" : "Show"} path payments
                  </span>
                </button>

                {advancedOpen && (
                  <div
                    id="advanced-settings-panel"
                    className="space-y-6 border-t border-white/5 pt-2"
                  >
                    <div>
                      <label
                        htmlFor="generator-recipient-asset"
                        className="mb-2 block text-xs font-bold uppercase tracking-wider text-neutral-200"
                      >
                        Recipient asset
                      </label>
                      <p
                        id="generator-recipient-asset-help"
                        className="mb-3 text-sm text-neutral-300"
                      >
                        Pick the asset that the recipient should receive.
                      </p>
                      <select
                        id="generator-recipient-asset"
                        value={recipientAssetCode}
                        onChange={(event) =>
                          setRecipientAssetCode(event.target.value)
                        }
                        aria-invalid={Boolean(errors.asset)}
                        aria-describedby={recipientAssetHelp}
                        className="w-full rounded-2xl border border-white/10 bg-neutral-900 p-4 font-bold text-white"
                      >
                        {verifiedAssets.map((asset) => (
                          <option key={asset.code} value={asset.code}>
                            {asset.code}
                            {asset.type !== "native" && asset.issuer
                              ? ` (${asset.issuer.slice(0, 4)}...)`
                              : ""}
                          </option>
                        ))}
                      </select>
                      {errors.asset && (
                        <p
                          id="generator-asset-error"
                          className="mt-2 text-xs text-red-300"
                        >
                          {errors.asset}
                        </p>
                      )}
                    </div>

                    <fieldset>
                      <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-neutral-200">
                        Allowed source assets
                      </legend>
                      <p
                        id="generator-source-assets-help"
                        className="mb-3 text-sm text-neutral-300"
                      >
                        Choose which assets payers may use. At least one option
                        stays enabled at all times.
                      </p>
                      <div
                        role="group"
                        aria-describedby="generator-source-assets-help"
                        className="flex flex-wrap gap-2"
                      >
                        {verifiedAssets.map((asset) => {
                          const enabled = sourceAssetCodes.has(asset.code);

                          return (
                            <button
                              key={asset.code}
                              type="button"
                              aria-pressed={enabled}
                              onClick={() => toggleSource(asset.code)}
                              className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${
                                enabled
                                  ? "border-indigo-300/60 bg-indigo-500/30 text-white"
                                  : "border-white/10 bg-neutral-900/50 text-neutral-200 hover:text-white"
                              }`}
                            >
                              {asset.code}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-xs text-neutral-300">
                        Active source assets: {sourceAssetsLabel}
                      </p>
                    </fieldset>

                    <div
                      aria-live="polite"
                      className="space-y-3 rounded-2xl border border-white/10 bg-neutral-950/60 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-xs font-black uppercase tracking-widest text-neutral-200">
                          Path preview
                        </h3>
                        {pathLoading && (
                          <span className="animate-pulse text-xs text-indigo-200">
                            Fetching estimates...
                          </span>
                        )}
                      </div>
                      {pathError && (
                        <p className="text-sm text-amber-300">{pathError}</p>
                      )}
                      {!pathLoading &&
                        !pathError &&
                        pathData &&
                        pathData.paths.length === 0 && (
                          <p className="text-sm text-neutral-200">
                            No compatible paths were found. Horizon source:{" "}
                            {pathData.horizonUrl}
                          </p>
                        )}
                      {pathData && pathData.paths.length > 0 && (
                        <ul className="max-h-64 space-y-3 overflow-y-auto pr-1">
                          {pathData.paths.map((path, index) => (
                            <li
                              key={`${path.sourceAsset}-${index}`}
                              className="rounded-xl border border-white/5 bg-black/40 p-3 text-sm"
                            >
                              <div className="font-mono text-neutral-100">
                                Pay {path.sourceAmount} {path.sourceAsset} to
                                deliver {path.destinationAmount}{" "}
                                {path.destinationAsset}
                              </div>
                              <div className="mt-1 text-xs text-neutral-300">
                                {path.hopCount} hops
                                {path.pathHops.length > 0
                                  ? ` -> ${path.pathHops.join(" -> ")}`
                                  : ""}
                              </div>
                              <div className="mt-1 text-xs text-neutral-400">
                                {path.rateDescription}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div
                      aria-live="polite"
                      className="space-y-3 rounded-2xl border border-white/10 bg-neutral-950/60 p-4"
                    >
                      <h3 className="text-xs font-black uppercase tracking-widest text-neutral-200">
                        Soroban preflight
                      </h3>
                      <p
                        id="generator-preflight-help"
                        className="text-xs text-neutral-300"
                      >
                        Simulate this request against a source account before
                        sharing it.
                      </p>
                      <label
                        htmlFor="generator-source-account"
                        className="block text-xs font-bold uppercase tracking-wider text-neutral-200"
                      >
                        Source account
                      </label>
                      <input
                        id="generator-source-account"
                        type="text"
                        placeholder="Source account public key"
                        value={preflightAccount}
                        onChange={(event) =>
                          setPreflightAccount(event.target.value)
                        }
                        aria-describedby="generator-preflight-help"
                        className="w-full rounded-xl border border-white/10 bg-neutral-900/80 p-3 font-mono text-sm text-white placeholder:text-neutral-400"
                      />
                      <button
                        type="button"
                        onClick={() => void runPreflight()}
                        disabled={preflightLoading}
                        className="w-full rounded-xl border border-white/10 bg-white/10 py-3 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-50"
                      >
                        {preflightLoading ? "Simulating..." : "Run preflight"}
                      </button>

                      {preflightUnavailable && (
                        <p className="text-sm text-amber-300">
                          {preflightUnavailable}
                        </p>
                      )}
                      {preflightResult && preflightResult.success === false && (
                        <p className="text-sm text-red-300">
                          {preflightResult.userMessage ??
                            preflightResult.error ??
                            "Simulation failed."}
                        </p>
                      )}
                      {preflightResult && preflightResult.success === true && (
                        <div className="space-y-1 text-sm text-emerald-300">
                          <p>Simulation looks good.</p>
                          {preflightResult.feeEstimate?.totalFeeXLM && (
                            <p className="font-mono text-neutral-100">
                              Total fee:{" "}
                              {preflightResult.feeEstimate.totalFeeXLM}
                            </p>
                          )}
                          {typeof preflightResult.simulationLatencyMs ===
                            "number" && (
                            <p className="text-xs text-neutral-300">
                              Latency: {preflightResult.simulationLatencyMs} ms
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </section>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-3xl bg-white py-6 text-3xl font-black text-black transition hover:bg-neutral-200 active:scale-95 disabled:opacity-60"
            >
              {loading ? "Generating..." : "Generate payment link"}
            </button>
            {error && (
              <p role="alert" className="text-center text-sm text-red-300">
                {error}
              </p>
            )}
          </form>

          <div className="space-y-12">
            <section
              aria-labelledby="qr-preview-title"
              className="mx-auto w-full max-w-sm"
            >
              <div className="mb-4 space-y-2 text-center">
                <h2 id="qr-preview-title" className="text-xl font-black">
                  Live QR preview
                </h2>
                <p className="text-sm text-neutral-300">
                  The preview updates as you fill in the form, so you can verify
                  the request before sharing it.
                </p>
              </div>
              <QRPreview value={linkData} />
            </section>

            <section className="space-y-4 rounded-3xl border border-white/5 bg-black/40 p-8 backdrop-blur-xl">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-neutral-200">
                Canonical query from the API
              </h2>

              <div
                aria-live="polite"
                className="min-h-[3rem] rounded-xl border border-white/5 bg-neutral-900 p-4 font-mono text-xs text-neutral-100 break-all"
              >
                {canonicalPreview ?? (
                  <span className="italic text-neutral-300">
                    Submit the form to fetch canonical metadata from the
                    backend.
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={!canonicalPreview}
                onClick={() => void handleCanonicalCopy()}
                className="w-full rounded-xl border border-white/5 bg-white/10 py-3 text-xs uppercase tracking-widest text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Copy canonical params
              </button>

              <p aria-live="polite" className="text-xs text-neutral-300">
                {copyStatus ?? "Use the canonical params for a text-based shareable fallback."}
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
