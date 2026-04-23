"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import { NetworkBadge } from "@/components/NetworkBadge";
import { useFocusPreview } from "@/hooks/useFocusPreview";
import {
  fetchUserBids,
  fetchUserListings,
  formatCountdown,
  type UserBid,
  type UserListing,
} from "@/hooks/marketplaceApi";
import { mockContractCall, mockFetch } from "@/hooks/mockApi";
import { useApi } from "@/hooks/useApi";

type ActivityItem = {
  id: string;
  amount: string;
  asset: string;
  memo: string;
  date: string;
  status: "Pending" | "Settled" | "Privacy Enabled";
  privacy: "Enabled" | "Public";
  action: "extend" | "cleanup";
};

type DashboardResponse = {
  items: ActivityItem[];
};

const ACTIVITY_ITEMS: ActivityItem[] = [
  {
    id: "GD2P...5H2W",
    amount: "50.00",
    asset: "USDC",
    memo: "Project milestone #1",
    date: "2 mins ago",
    status: "Pending",
    privacy: "Enabled",
    action: "extend",
  },
  {
    id: "GD1R...3K9L",
    amount: "125.00",
    asset: "XLM",
    memo: "Frontend consulting",
    date: "Jan 20, 14:32",
    status: "Settled",
    privacy: "Public",
    action: "cleanup",
  },
  {
    id: "GC8T...9Q0M",
    amount: "20.00",
    asset: "USDC",
    memo: "Subscription renewal",
    date: "Jan 19, 09:12",
    status: "Privacy Enabled",
    privacy: "Enabled",
    action: "cleanup",
  },
];

function statusClasses(status: ActivityItem["status"]) {
  switch (status) {
    case "Pending":
      return "text-amber-300";
    case "Settled":
      return "text-emerald-300";
    default:
      return "text-indigo-200";
  }
}

export default function Dashboard() {
  useFocusPreview();

  const { data, error, loading, callApi } = useApi<DashboardResponse>();
  const [userBids, setUserBids] = useState<UserBid[]>([]);
  const [userListings, setUserListings] = useState<UserListing[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    void callApi(() =>
      mockFetch({
        items: ACTIVITY_ITEMS,
      }),
    );

    void fetchUserBids().then(setUserBids);
    void fetchUserListings().then(setUserListings);
  }, [callApi]);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timer = window.setTimeout(() => setStatusMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const handleExtend = async (id: string) => {
    await mockContractCall("extend", id);
    setStatusMessage(`Storage TTL extended for transaction ${id}.`);
  };

  const handleCleanup = async (id: string) => {
    await mockContractCall("cleanup", id);
    setStatusMessage(`Storage deposit reclaimed for transaction ${id}.`);
  };

  const activityItems = data?.items ?? [];

  if (loading) {
    return <p className="text-neutral-200">Loading dashboard...</p>;
  }

  if (error) {
    return <p className="text-red-300">{error}</p>;
  }

  return (
    <div className="relative min-h-screen text-white">
      <NetworkBadge />

      <div className="fixed left-[-30%] top-[-20%] h-[60%] w-[60%] rounded-full bg-indigo-500/10 blur-[120px]" />
      <div className="fixed bottom-[-20%] right-[-30%] h-[50%] w-[50%] rounded-full bg-purple-500/5 blur-[100px]" />

      <aside className="fixed left-0 top-0 z-20 hidden h-screen w-72 flex-col border-r border-white/5 bg-black/20 backdrop-blur-3xl md:flex">
        <nav
          aria-label="Dashboard quick navigation"
          className="flex-1 space-y-2 px-4 py-20"
        >
          <Link
            href="/dashboard"
            aria-current="page"
            className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 px-4 py-3 font-bold text-white"
          >
            <span aria-hidden="true" className="text-indigo-300">
              📊
            </span>
            Dashboard
          </Link>
          <Link
            href="/generator"
            className="flex items-center gap-3 rounded-2xl px-4 py-3 font-semibold text-neutral-200 transition hover:bg-white/5 hover:text-white"
          >
            <span aria-hidden="true">⚡</span>
            Link Generator
          </Link>
          <Link
            href="/marketplace"
            className="flex items-center gap-3 rounded-2xl px-4 py-3 font-semibold text-neutral-200 transition hover:bg-white/5 hover:text-white"
          >
            <span aria-hidden="true">🏪</span>
            Marketplace
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

      <main className="relative z-10 p-4 sm:p-6 md:ml-72 md:p-12">
        <header className="mb-10 flex flex-col gap-6 md:mb-16 md:flex-row md:items-start md:justify-between">
          <div>
            <nav
              aria-label="Breadcrumb"
              className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-neutral-300 md:mb-4"
            >
              <span>QuickEx</span>
              <span aria-hidden="true">/</span>
              <span className="text-neutral-100">Dashboard</span>
            </nav>

            <h1 className="mb-2 text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
              Welcome back.
            </h1>
            <p className="text-sm font-medium text-neutral-200 sm:text-base md:text-lg">
              Your global payments are scaling beautifully.
            </p>
          </div>

          <button
            id="dashboard-withdraw-button"
            type="button"
            onClick={() => setStatusMessage("Withdraw flow coming soon.")}
            className="rounded-xl bg-indigo-500 px-4 py-3 font-bold text-white shadow-lg transition hover:scale-105 active:scale-95 sm:px-6"
          >
            Withdraw Funds
          </button>
        </header>

        <p aria-live="polite" className="mb-6 text-sm text-neutral-200">
          {statusMessage ??
            "Use Tab to move through cards, filters, and transaction actions."}
        </p>

        <section className="mb-10 grid grid-cols-1 gap-6 md:mb-16 sm:grid-cols-2 lg:grid-cols-3">
          <div className="group relative overflow-hidden rounded-3xl border border-white/5 bg-neutral-900/40 p-6 transition hover:border-indigo-500/30 sm:p-8">
            <div className="absolute right-0 top-0 p-4 opacity-10 transition group-hover:opacity-20">
              <span className="text-5xl font-black text-indigo-300 sm:text-6xl">
                $
              </span>
            </div>
            <p className="mb-1 text-xs font-bold uppercase text-neutral-300 sm:text-sm">
              Total Revenue
            </p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-black sm:text-5xl">$1,240.50</p>
              <span className="rounded-lg bg-emerald-400/10 px-2 py-1 text-xs font-black text-emerald-300">
                +12.5%
              </span>
            </div>
          </div>

          <div className="rounded-3xl border border-white/5 bg-neutral-900/40 p-6 sm:p-8">
            <p className="mb-1 text-xs font-bold uppercase text-neutral-300 sm:text-sm">
              Success Rate
            </p>
            <p className="text-3xl font-black sm:text-5xl">98.2%</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full w-[98%] bg-indigo-400" />
            </div>
          </div>

          <div className="rounded-3xl border border-indigo-300/50 bg-indigo-500 p-6 shadow-[0_20px_40px_-15px_rgba(99,102,241,0.3)] sm:p-8">
            <p className="mb-1 text-xs font-bold uppercase text-indigo-50 sm:text-sm">
              Available Payout
            </p>
            <p className="text-3xl font-black sm:text-5xl">
              850.00 <span className="text-base opacity-80 sm:text-2xl">USDC</span>
            </p>
            <p className="mt-3 text-xs text-indigo-50/90">
              Estimated settlement: 3 seconds
            </p>
          </div>
        </section>

        <div className="mb-10 md:mb-16">
          <AnalyticsDashboard />
        </div>

        <section className="overflow-hidden rounded-3xl border border-white/5 bg-black/40 shadow-2xl backdrop-blur-2xl">
          <div className="flex flex-col justify-between gap-4 border-b border-white/5 p-6 sm:flex-row sm:p-10">
            <div>
              <h2 className="mb-1 text-xl font-black sm:text-2xl">
                Activity Feed
              </h2>
              <p className="text-xs text-neutral-200 sm:text-sm">
                Synced with Stellar Horizon API
              </p>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/5 p-2">
              <label htmlFor="dashboard-range" className="sr-only">
                Filter activity period
              </label>
              <select
                id="dashboard-range"
                className="bg-transparent text-sm font-bold text-neutral-100"
                defaultValue="Last 30 Days"
              >
                <option>Last 30 Days</option>
                <option>Yearly</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[700px] w-full text-left">
              <caption className="sr-only">
                Recent payment activity with actions to extend TTL or clean up
                completed records.
              </caption>
              <thead>
                <tr className="border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-neutral-300">
                  <th className="px-6 py-4 sm:px-10 sm:py-6">Transaction ID</th>
                  <th className="px-6 py-4 sm:px-10 sm:py-6">Asset</th>
                  <th className="px-6 py-4 sm:px-10 sm:py-6">Memo / Status</th>
                  <th className="px-6 py-4 sm:px-10 sm:py-6">Timestamp</th>
                  <th className="px-6 py-4 text-right sm:px-10 sm:py-6">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5">
                {activityItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-8 text-center text-sm text-neutral-200 sm:px-10"
                    >
                      No transactions yet. Create your first payment link.
                    </td>
                  </tr>
                ) : (
                  activityItems.map((item, index) => (
                    <tr
                      key={item.id}
                      className="transition hover:bg-white/[0.03]"
                    >
                      <td className="px-6 py-6 sm:px-10">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 font-mono text-[10px] opacity-70">
                            #{index + 1}
                          </span>
                          <span className="font-mono text-sm text-neutral-100 sm:text-base">
                            {item.id}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-6 text-lg font-black sm:px-10">
                        {item.amount} {item.asset}
                      </td>
                      <td className="px-6 py-6 sm:px-10">
                        <div className="flex flex-col">
                          <span className="font-bold text-neutral-100">
                            {item.memo}
                          </span>
                          <div className="mt-1 flex items-center gap-2">
                            <span
                              className={`text-[10px] font-black uppercase tracking-widest ${statusClasses(
                                item.status,
                              )}`}
                            >
                              {item.status}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-neutral-300">
                              Privacy {item.privacy}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-6 text-neutral-200 sm:px-10">
                        {item.date}
                      </td>
                      <td className="px-6 py-6 text-right sm:px-10">
                        {item.action === "extend" ? (
                          <button
                            type="button"
                            onClick={() => void handleExtend(item.id)}
                            aria-label={`Extend TTL for transaction ${item.id}`}
                            className="rounded-lg bg-indigo-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-200 transition hover:bg-indigo-500 hover:text-white"
                          >
                            Extend TTL
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleCleanup(item.id)}
                            aria-label={`Clean up transaction ${item.id}`}
                            className="rounded-lg bg-red-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-200 transition hover:bg-red-500 hover:text-white"
                          >
                            Cleanup
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white/[0.01] p-6 text-center sm:p-8">
            <button
              type="button"
              onClick={() => setStatusMessage("Full ledger view coming soon.")}
              className="text-xs font-black uppercase tracking-widest text-neutral-200 transition hover:text-white sm:text-sm"
            >
              View Full Ledger {"->"}
            </button>
          </div>
        </section>

        <section className="mt-10 overflow-hidden rounded-3xl border border-white/5 bg-black/40 shadow-2xl backdrop-blur-2xl md:mt-16">
          <div className="flex flex-col items-start justify-between gap-4 border-b border-white/5 p-6 sm:flex-row sm:items-center sm:p-10">
            <div>
              <h2 className="mb-1 text-xl font-black sm:text-2xl">
                Marketplace Activity
              </h2>
              <p className="text-xs text-neutral-200 sm:text-sm">
                Your active bids and listed usernames
              </p>
            </div>
            <Link
              href="/marketplace"
              className="rounded-xl border border-indigo-300/40 bg-indigo-500/10 px-5 py-2.5 text-sm font-bold text-indigo-100 transition hover:bg-indigo-500 hover:text-white"
            >
              Browse Marketplace {"->"}
            </Link>
          </div>

          <div className="grid divide-y divide-white/5 md:grid-cols-2 md:divide-x md:divide-y-0">
            <div className="p-6 sm:p-8">
              <h3 className="mb-5 text-sm font-black uppercase tracking-widest text-neutral-300">
                My Active Bids
              </h3>
              {userBids.length === 0 ? (
                <p className="text-sm text-neutral-200">
                  No active bids yet.{" "}
                  <Link href="/marketplace" className="text-indigo-200 underline">
                    Browse the marketplace
                  </Link>
                  .
                </p>
              ) : (
                <div className="space-y-3">
                  {userBids.map((bid) => (
                    <div
                      key={bid.username}
                      className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.03] p-4"
                    >
                      <div>
                        <p className="text-base font-black">@{bid.username}</p>
                        <p className="text-[11px] text-neutral-200">
                          My bid: {bid.myBid} USDC - Ends{" "}
                          {formatCountdown(bid.endsAt)}
                        </p>
                      </div>
                      <span
                        className={`rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
                          bid.isWinning
                            ? "border border-emerald-300/40 bg-emerald-400/10 text-emerald-200"
                            : "border border-red-300/40 bg-red-400/10 text-red-200"
                        }`}
                      >
                        {bid.isWinning ? "Winning" : "Outbid"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 sm:p-8">
              <h3 className="mb-5 text-sm font-black uppercase tracking-widest text-neutral-300">
                My Listings
              </h3>
              {userListings.length === 0 ? (
                <p className="text-sm text-neutral-200">
                  No usernames listed yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {userListings.map((listing) => (
                    <div
                      key={listing.username}
                      className="rounded-2xl border border-white/5 bg-white/[0.03] p-4"
                    >
                      <div className="mb-2 flex items-start justify-between">
                        <p className="text-base font-black">
                          @{listing.username}
                        </p>
                        <span className="rounded-lg border border-indigo-300/40 bg-indigo-400/10 px-2 py-1 text-[10px] font-black text-indigo-100">
                          {listing.bidCount} bids
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-neutral-200">
                        <span>Current: {listing.currentBid} USDC</span>
                        <span>Ends: {formatCountdown(listing.endsAt)}</span>
                      </div>
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full bg-indigo-400"
                          style={{
                            width: `${Math.min(
                              100,
                              (listing.currentBid / (listing.minBid * 5)) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
