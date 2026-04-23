"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import {
  fetchAnalytics,
  type AnalyticsData,
  type DateRange,
} from "@/hooks/analyticsApi";

const RANGES: Array<{ label: string; value: DateRange }> = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "All Time", value: "all" },
];

const tooltipStyle = {
  contentStyle: {
    background: "rgba(10,10,20,0.96)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    color: "#fff",
    fontSize: "12px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  labelStyle: { color: "#a5b4fc", fontWeight: 800 },
  cursor: { stroke: "rgba(99,102,241,0.3)", strokeWidth: 2 },
};

function ChartSkeleton() {
  return (
    <div className="flex h-full animate-pulse flex-col gap-3">
      <div className="h-4 w-1/3 rounded bg-white/5" />
      <div className="flex-1 rounded-2xl bg-white/[0.03]" />
    </div>
  );
}

function StatCard({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change?: number;
}) {
  const positive = (change ?? 0) >= 0;

  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-white/5 bg-white/[0.03] p-5">
      <p className="text-[10px] font-black uppercase tracking-widest text-neutral-300">
        {label}
      </p>
      <p className="text-2xl font-black">{value}</p>
      {change !== undefined && (
        <span
          className={`w-fit rounded-lg px-2 py-0.5 text-[11px] font-black ${
            positive
              ? "bg-emerald-400/10 text-emerald-300"
              : "bg-red-400/10 text-red-300"
          }`}
        >
          {positive ? "+" : ""}
          {change}%
        </span>
      )}
    </div>
  );
}

function formatMoney(value: number) {
  return value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${value}`;
}

function getTopAsset(data: AnalyticsData | null) {
  if (!data || data.assetDist.length === 0) {
    return "None";
  }

  return [...data.assetDist].sort((left, right) => right.value - left.value)[0]
    .name;
}

export default function AnalyticsDashboard() {
  const [range, setRange] = useState<DateRange>("30d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback((nextRange: DateRange) => {
    setLoading(true);

    fetchAnalytics(nextRange).then((nextData) => {
      setData(nextData);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    loadAnalytics(range);
  }, [loadAnalytics, range]);

  const summary = data?.summary ?? null;
  const volume = data?.volume ?? [];
  const txCount = data?.txCount ?? [];
  const assetDist = data?.assetDist ?? [];
  const topAsset = getTopAsset(data);
  const totalShare = assetDist.reduce((sum, item) => sum + item.value, 0);

  const srSummary = loading
    ? `Loading analytics summary for ${range}.`
    : summary
      ? `Analytics for ${range}: ${summary.totalTx.toLocaleString()} transactions, ${formatMoney(
          summary.totalVolume,
        )} total volume, average transaction size ${formatMoney(
          summary.avgTxSize,
        )}, top asset ${topAsset}.`
      : "Analytics data is unavailable.";

  return (
    <section
      aria-labelledby="analytics-overview-title"
      className="overflow-hidden rounded-3xl border border-white/5 bg-black/40 shadow-2xl backdrop-blur-2xl"
    >
      <div className="border-b border-white/5 p-6 sm:p-10">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2
              id="analytics-overview-title"
              className="mb-1 text-xl font-black sm:text-2xl"
            >
              Analytics Overview
            </h2>
            <p className="text-xs text-neutral-300 sm:text-sm">
              Payment volume, transaction counts, and asset distribution
            </p>
          </div>

          <div
            role="group"
            aria-label="Select analytics date range"
            className="inline-flex gap-1 rounded-xl border border-white/5 bg-white/5 p-1"
          >
            {RANGES.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={range === item.value}
                onClick={() => setRange(item.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-black transition-all ${
                  range === item.value
                    ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                    : "text-neutral-200 hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <p className="sr-only" aria-live="polite">
          {srSummary}
        </p>
      </div>

      <div className="space-y-10 p-6 sm:p-10">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {loading || !summary ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-24 animate-pulse rounded-2xl bg-white/[0.03]"
              />
            ))
          ) : (
            <>
              <StatCard
                label="Total Volume"
                value={formatMoney(summary.totalVolume)}
                change={summary.changeVolumePercent}
              />
              <StatCard
                label="Transactions"
                value={summary.totalTx.toLocaleString()}
              />
              <StatCard
                label="Avg Tx Size"
                value={formatMoney(summary.avgTxSize)}
              />
              <StatCard label="Top Asset" value={topAsset} />
            </>
          )}
        </div>

        <div className="grid gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-sm text-neutral-200 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-neutral-300">
              Volume
            </p>
            <p>
              {summary
                ? `${formatMoney(summary.totalVolume)} processed in ${range}.`
                : "Waiting for analytics data."}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-neutral-300">
              Transactions
            </p>
            <p>
              {summary
                ? `${summary.totalTx.toLocaleString()} payments were recorded.`
                : "Transaction totals will appear here."}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-neutral-300">
              Asset Mix
            </p>
            <p>
              {assetDist.length > 0
                ? `${topAsset} leads the mix with ${Math.max(
                    ...assetDist.map((item) => item.value),
                  )}% share.`
                : "Asset distribution will appear here."}
            </p>
          </div>
        </div>

        <div>
          <h3 className="mb-5 text-sm font-black uppercase tracking-widest text-neutral-300">
            Payment Volume
          </h3>
          <div aria-hidden="true" className="h-64">
            {loading ? (
              <ChartSkeleton />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={volume}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gUsdc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gXlm" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.06)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#cbd5e1", fontSize: 10, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: "#cbd5e1", fontSize: 10, fontWeight: 700 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value: number) => `$${value}`}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value?: ValueType, name?: NameType) => [
                      `$${Number(value ?? 0).toLocaleString()}`,
                      name === "volumeUSDC" ? "USDC" : "XLM",
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, fontWeight: 800, paddingTop: 12 }}
                    formatter={(value) =>
                      value === "volumeUSDC" ? "USDC Volume" : "XLM Volume"
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="volumeUSDC"
                    stroke="#818cf8"
                    strokeWidth={2}
                    fill="url(#gUsdc)"
                    dot={false}
                    activeDot={{ r: 5, fill: "#818cf8" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="volumeXLM"
                    stroke="#c084fc"
                    strokeWidth={2}
                    fill="url(#gXlm)"
                    dot={false}
                    activeDot={{ r: 5, fill: "#c084fc" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h3 className="mb-5 text-sm font-black uppercase tracking-widest text-neutral-300">
              Transaction Count
            </h3>
            <div aria-hidden="true" className="h-56">
              {loading ? (
                <ChartSkeleton />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={txCount}
                    margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.06)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#cbd5e1", fontSize: 10, fontWeight: 700 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: "#cbd5e1", fontSize: 10, fontWeight: 700 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(value?: ValueType) => [
                        Number(value ?? 0),
                        "Transactions",
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#818cf8"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{
                        r: 6,
                        fill: "#818cf8",
                        stroke: "rgba(99,102,241,0.3)",
                        strokeWidth: 6,
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div>
            <h3 className="mb-5 text-sm font-black uppercase tracking-widest text-neutral-300">
              Asset Distribution
            </h3>
            <div aria-hidden="true" className="h-56">
              {loading ? (
                <ChartSkeleton />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={assetDist}
                      cx="50%"
                      cy="50%"
                      innerRadius="52%"
                      outerRadius="75%"
                      dataKey="value"
                      nameKey="name"
                      paddingAngle={3}
                    >
                      {assetDist.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(value?: ValueType, name?: NameType) => [
                        `${Number(value ?? 0)}%`,
                        name ?? "",
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, fontWeight: 800 }}
                      formatter={(value) => {
                        const found = assetDist.find((item) => item.name === value);
                        return `${value} ${found ? `(${found.value}%)` : ""}`;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            {!loading && assetDist.length > 0 && (
              <p className="mt-4 text-sm text-neutral-300">
                The current mix accounts for {totalShare}% of volume across{" "}
                {assetDist.length} tracked asset groups.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
