"use client";

import { useState } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";

export function WorkspaceSwitcher() {
  const { currentWorkspace, workspaces, switchWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex text-left">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-neutral-900/80 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:border-indigo-500/40 hover:bg-neutral-900"
      >
        <div className="text-left">
          <p className="text-[10px] uppercase tracking-widest text-neutral-500">Workspace</p>
          <p className="leading-none">{currentWorkspace.name}</p>
        </div>
        <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-widest text-white/80">
          {currentWorkspace.role}
        </span>
        <span className="text-neutral-400">▾</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-3 w-72 origin-top-right rounded-3xl border border-white/10 bg-neutral-950/95 p-3 shadow-2xl backdrop-blur-3xl">
          <div className="mb-3 px-3 text-xs uppercase tracking-[0.24em] text-neutral-500 font-semibold">
            Choose workspace
          </div>
          <div className="space-y-2">
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                onClick={() => {
                  switchWorkspace(workspace.id);
                  setOpen(false);
                }}
                className={`group flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition ${
                  workspace.id === currentWorkspace.id
                    ? "bg-indigo-500/10 text-white"
                    : "bg-white/5 text-neutral-300 hover:bg-white/10"
                }`}
              >
                <div>
                  <p className="font-semibold">{workspace.name}</p>
                  <p className="text-[11px] text-neutral-500 leading-5">quickex.to/{workspace.namespace}</p>
                </div>
                <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] uppercase tracking-widest text-neutral-300">
                  {workspace.role}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
