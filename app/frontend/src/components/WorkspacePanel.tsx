"use client";

import Link from "next/link";
import { useWorkspace } from "@/context/WorkspaceContext";

export function WorkspacePanel() {
  const { currentWorkspace } = useWorkspace();

  return (
    <div className="rounded-3xl bg-neutral-900/40 border border-white/5 p-5 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-neutral-500 font-semibold">
            Active workspace
          </p>
          <h2 className="mt-3 text-xl font-black tracking-tight text-white">
            {currentWorkspace.name}
          </h2>
          <p className="mt-2 text-sm text-neutral-400">
            quickex.to/{currentWorkspace.namespace}
          </p>
        </div>
        <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-[11px] uppercase tracking-widest text-indigo-200 font-bold">
          {currentWorkspace.role}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white/5 p-3">
          <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Balance</p>
          <p className="mt-2 font-semibold text-white">{currentWorkspace.balance}</p>
        </div>
        <div className="rounded-2xl bg-white/5 p-3">
          <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Active links</p>
          <p className="mt-2 font-semibold text-white">{currentWorkspace.activeLinks}</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-neutral-400">
        {currentWorkspace.description}
      </p>

      <Link
        href="/settings/team"
        className="mt-5 inline-flex items-center justify-center rounded-2xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
      >
        Manage team roles
      </Link>
    </div>
  );
}
