"use client";

import { useMemo, useState } from "react";

type FeatureFlag = {
  key: string;
  description: string;
  owner: string;
  enabled: boolean;
};

type ServiceHealth = {
  name: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  lastCheck: string;
};

type OpsEvent = {
  id: string;
  event: string;
  actor: string;
  severity: "info" | "warning" | "critical";
  timestamp: string;
};

const INITIAL_FLAGS: FeatureFlag[] = [
  {
    key: "signed_action_prompts",
    description: "Require explicit signed intent for high-risk actions.",
    owner: "Security Team",
    enabled: true,
  },
  {
    key: "privacy_xray_mode",
    description: "Allow private transfer mode for eligible flows.",
    owner: "Payments Team",
    enabled: true,
  },
  {
    key: "marketplace_live_bidding",
    description: "Enable real-time marketplace bid updates.",
    owner: "Growth Team",
    enabled: false,
  },
];

const SERVICE_HEALTH: ServiceHealth[] = [
  {
    name: "API Gateway",
    status: "healthy",
    latencyMs: 82,
    lastCheck: "20s ago",
  },
  {
    name: "Stellar Horizon",
    status: "degraded",
    latencyMs: 420,
    lastCheck: "35s ago",
  },
  {
    name: "Notification Worker",
    status: "healthy",
    latencyMs: 64,
    lastCheck: "18s ago",
  },
];

const OPS_EVENTS: OpsEvent[] = [
  {
    id: "OPS-1083",
    event: "Feature flag updated: signed_action_prompts",
    actor: "menjay7",
    severity: "info",
    timestamp: "2 min ago",
  },
  {
    id: "OPS-1082",
    event: "Latency spike detected on Stellar Horizon",
    actor: "health-bot",
    severity: "warning",
    timestamp: "9 min ago",
  },
  {
    id: "OPS-1081",
    event: "Payment retries crossed threshold on testnet",
    actor: "ops-bot",
    severity: "critical",
    timestamp: "17 min ago",
  },
];

function statusPillClass(status: ServiceHealth["status"]) {
  if (status === "healthy") return "text-emerald-300 bg-emerald-500/10";
  if (status === "degraded") return "text-amber-300 bg-amber-500/10";
  return "text-red-300 bg-red-500/10";
}

function severityPillClass(severity: OpsEvent["severity"]) {
  if (severity === "info") return "text-blue-300 bg-blue-500/10";
  if (severity === "warning") return "text-amber-300 bg-amber-500/10";
  return "text-red-300 bg-red-500/10";
}

export default function AdminConsolePage() {
  const [flags, setFlags] = useState<FeatureFlag[]>(INITIAL_FLAGS);

  const enabledFlagsCount = useMemo(
    () => flags.filter((flag) => flag.enabled).length,
    [flags],
  );

  const toggleFlag = (key: string) => {
    setFlags((prev) =>
      prev.map((flag) =>
        flag.key === key ? { ...flag, enabled: !flag.enabled } : flag,
      ),
    );
  };

  return (
    <div className="min-h-screen text-white">
      <section className="mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 mb-3">
          Admin Console v1
        </p>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
          Flags + Health + Ops Views
        </h1>
        <p className="text-neutral-400 max-w-3xl">
          Operate core production controls in one place. This view centralizes
          feature gating, service health, and operational events for faster
          incident response.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
        <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-5">
          <p className="text-xs uppercase tracking-widest text-neutral-500 mb-1">
            Feature Flags
          </p>
          <p className="text-3xl font-black">{enabledFlagsCount}</p>
          <p className="text-xs text-neutral-500">Enabled now</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-5">
          <p className="text-xs uppercase tracking-widest text-neutral-500 mb-1">
            Services Healthy
          </p>
          <p className="text-3xl font-black">
            {SERVICE_HEALTH.filter((svc) => svc.status === "healthy").length}/
            {SERVICE_HEALTH.length}
          </p>
          <p className="text-xs text-neutral-500">Current checks</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-neutral-900/50 p-5">
          <p className="text-xs uppercase tracking-widest text-neutral-500 mb-1">
            Open Critical Ops
          </p>
          <p className="text-3xl font-black">
            {OPS_EVENTS.filter((evt) => evt.severity === "critical").length}
          </p>
          <p className="text-xs text-neutral-500">Needs attention</p>
        </div>
        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-5">
          <p className="text-xs uppercase tracking-widest text-indigo-200/80 mb-3">
            Repo Avatar
          </p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-500 text-white font-black flex items-center justify-center">
              Q
            </div>
            <div>
              <p className="font-bold">QiuckEx</p>
              <p className="text-xs text-indigo-100/70">menjay7/QiuckEx</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 rounded-3xl border border-white/10 bg-neutral-900/40 p-6">
          <h2 className="text-xl font-black mb-1">Feature Flags</h2>
          <p className="text-sm text-neutral-400 mb-5">
            Runtime controls for staged rollouts and risk mitigation.
          </p>
          <div className="space-y-4">
            {flags.map((flag) => (
              <div
                key={flag.key}
                className="rounded-2xl border border-white/10 p-4 bg-black/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-sm">{flag.key}</p>
                    <p className="text-xs text-neutral-400 mt-1">
                      {flag.description}
                    </p>
                    <p className="text-[11px] text-neutral-500 mt-2">
                      Owner: {flag.owner}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFlag(flag.key)}
                    className={`text-xs px-3 py-1 rounded-full font-bold transition ${
                      flag.enabled
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-neutral-700 text-neutral-300"
                    }`}
                  >
                    {flag.enabled ? "Enabled" : "Disabled"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="xl:col-span-1 rounded-3xl border border-white/10 bg-neutral-900/40 p-6">
          <h2 className="text-xl font-black mb-1">Health View</h2>
          <p className="text-sm text-neutral-400 mb-5">
            Service availability and basic latency posture.
          </p>
          <div className="space-y-4">
            {SERVICE_HEALTH.map((service) => (
              <div
                key={service.name}
                className="rounded-2xl border border-white/10 p-4 bg-black/30"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold">{service.name}</p>
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${statusPillClass(service.status)}`}
                  >
                    {service.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-neutral-400">
                  <span>Latency: {service.latencyMs}ms</span>
                  <span>Last check: {service.lastCheck}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="xl:col-span-1 rounded-3xl border border-white/10 bg-neutral-900/40 p-6">
          <h2 className="text-xl font-black mb-1">Ops View</h2>
          <p className="text-sm text-neutral-400 mb-5">
            Recent operational events and alerts.
          </p>
          <div className="space-y-4">
            {OPS_EVENTS.map((event) => (
              <div
                key={event.id}
                className="rounded-2xl border border-white/10 p-4 bg-black/30"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold">{event.id}</p>
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${severityPillClass(event.severity)}`}
                  >
                    {event.severity}
                  </span>
                </div>
                <p className="text-sm text-neutral-200 mb-2">{event.event}</p>
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>Actor: {event.actor}</span>
                  <span>{event.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
