"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WorkspacePanel } from "@/components/WorkspacePanel";
import { useWorkspace } from "@/context/WorkspaceContext";

const ROLE_OPTIONS = ["Admin", "Operator", "Viewer"] as const;

type Role = (typeof ROLE_OPTIONS)[number];

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: Role;
  joined: string;
  status: "Active" | "Pending";
};

const WORKSPACE_MEMBERS: Record<string, TeamMember[]> = {
  "pulsefy-studios": [
    { id: "m-1", name: "Nora Chen", email: "nora@pulsefy.io", role: "Admin", joined: "Jan 2, 2026", status: "Active" },
    { id: "m-2", name: "James Ortiz", email: "james@pulsefy.io", role: "Operator", joined: "Jan 15, 2026", status: "Active" },
    { id: "m-3", name: "Elena Park", email: "elena@pulsefy.io", role: "Viewer", joined: "Feb 5, 2026", status: "Active" },
  ],
  "pulsefy-labs": [
    { id: "m-4", name: "Mina Olu", email: "mina@pulsefy.io", role: "Operator", joined: "Feb 22, 2026", status: "Active" },
    { id: "m-5", name: "Raj Patel", email: "raj@pulsefy.io", role: "Viewer", joined: "Mar 11, 2026", status: "Active" },
  ],
  "pulsefy-donations": [
    { id: "m-6", name: "Sam Rivera", email: "sam@pulsefy.io", role: "Viewer", joined: "Mar 21, 2026", status: "Active" },
    { id: "m-7", name: "Ava Liu", email: "ava@pulsefy.io", role: "Viewer", joined: "Apr 1, 2026", status: "Pending" },
  ],
};

export default function TeamSettings() {
  const { currentWorkspace, isAdmin, isOperator, isViewer } = useWorkspace();
  const [members, setMembers] = useState<TeamMember[]>(WORKSPACE_MEMBERS[currentWorkspace.id] ?? []);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");

  useEffect(() => {
    setMembers(WORKSPACE_MEMBERS[currentWorkspace.id] ?? []);
    setInviteName("");
    setInviteEmail("");
  }, [currentWorkspace.id]);

  const canInvite = isAdmin;
  const canManageMembers = isAdmin || isOperator;
  const inviteDisabledMessage = isViewer
    ? "Viewer access cannot invite new members. Ask an admin to invite your collaborator."
    : "Only workspace admins can invite team members.";

  const handleInvite = () => {
    if (!canInvite || !inviteName.trim() || !inviteEmail.trim()) {
      return;
    }

    setMembers((current) => [
      {
        id: `m-${Date.now()}`,
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        role: "Viewer",
        joined: "Just now",
        status: "Pending",
      },
      ...current,
    ]);

    setInviteName("");
    setInviteEmail("");
  };

  const handleRoleChange = (id: string, newRole: Role) => {
    if (!canManageMembers) return;
    setMembers((current) =>
      current.map((member) =>
        member.id === id
          ? {
              ...member,
              role: newRole,
            }
          : member,
      ),
    );
  };

  const handleRemove = (id: string) => {
    if (!canManageMembers) return;
    setMembers((current) => current.filter((member) => member.id !== id));
  };

  return (
    <div className="relative min-h-screen text-white selection:bg-indigo-500/30 overflow-x-hidden">
      <div className="fixed top-[-20%] left-[-30%] w-[60%] h-[60%] bg-indigo-500/10 blur-[120px] rounded-full" />
      <div className="fixed bottom-[-20%] right-[-30%] w-[50%] h-[50%] bg-purple-500/5 blur-[100px] rounded-full" />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-8">
        <div className="mb-10 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500 font-semibold mb-3">
              Settings / Team
            </p>
            <h1 className="text-4xl font-black tracking-tight">Workspace team access</h1>
            <p className="mt-3 max-w-2xl text-sm text-neutral-400 leading-6">
              Manage users and role-based access for {currentWorkspace.name}. Workspace data and actions are isolated by workspace selection.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/settings"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 transition"
            >
              Back to settings
            </Link>
            <span className="rounded-2xl bg-white/5 px-4 py-3 text-sm font-semibold text-neutral-300">
              Current role: {currentWorkspace.role}
            </span>
          </div>
        </div>

        <div className="grid gap-8 xl:grid-cols-[320px_1fr]">
          <div>
            <WorkspacePanel />

            <div className="rounded-3xl border border-white/5 bg-neutral-900/40 p-5">
              <h2 className="text-lg font-bold mb-3">Permission summary</h2>
              <p className="text-sm leading-6 text-neutral-400">
                {isAdmin
                  ? "Admins can invite, remove, and update team roles across this workspace."
                  : isOperator
                  ? "Operators may update team roles and review members, but invitations are limited to workspace admins."
                  : "Viewers can inspect team membership and workspace activity, but all management actions are disabled."}
              </p>

              <div className="mt-5 space-y-3 text-sm text-neutral-300">
                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="font-semibold">Workspace isolation</p>
                  <p className="mt-1 text-neutral-500">
                    Each workspace keeps link history, balances, and permissions separate.
                  </p>
                </div>
                <div className="rounded-2xl bg-white/5 p-4">
                  <p className="font-semibold">Audit-friendly controls</p>
                  <p className="mt-1 text-neutral-500">
                    Restricted actions show clear explanation text when they are unavailable.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <section className="rounded-3xl border border-white/5 bg-neutral-900/40 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold">Invite new team member</h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    Add someone to this workspace and assign a role based on how they should access QuickEx.
                  </p>
                </div>
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-500 font-semibold">
                  {currentWorkspace.members} members
                </span>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm text-neutral-200">
                  <span>Name</span>
                  <input
                    value={inviteName}
                    onChange={(event) => setInviteName(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="Full name"
                  />
                </label>
                <label className="space-y-2 text-sm text-neutral-200">
                  <span>Email address</span>
                  <input
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="user@example.com"
                  />
                </label>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-neutral-500 max-w-xl">
                  Invited members join with viewer access by default until their role is updated.
                </p>
                <button
                  onClick={handleInvite}
                  disabled={!canInvite || !inviteName.trim() || !inviteEmail.trim()}
                  className="inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-neutral-500 bg-indigo-500 text-white hover:bg-indigo-400"
                >
                  Invite member
                </button>
              </div>

              {!canInvite ? (
                <p className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
                  {inviteDisabledMessage}
                </p>
              ) : null}
            </section>

            <section className="rounded-3xl border border-white/5 bg-neutral-900/40 overflow-hidden">
              <div className="flex flex-col gap-2 px-6 py-5 border-b border-white/10 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold">Workspace members</h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    Modify role assignments and see member status for the selected workspace.
                  </p>
                </div>
                <p className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-neutral-400">
                  {members.length} active entries
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/5 text-left text-sm text-neutral-300">
                  <thead className="bg-white/5 text-[10px] uppercase tracking-[0.3em] text-neutral-500">
                    <tr>
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Role</th>
                      <th className="px-6 py-4">Joined</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {members.map((member) => {
                      const isSelf = member.role === "Admin" && member.email === "nora@pulsefy.io";
                      const disableActions = isViewer || (!isAdmin && member.role === "Admin");
                      return (
                        <tr key={member.id} className="hover:bg-white/5 transition">
                          <td className="px-6 py-4 font-semibold text-white">{member.name}</td>
                          <td className="px-6 py-4 text-neutral-500">{member.email}</td>
                          <td className="px-6 py-4">
                            <div className="max-w-[220px]">
                              <select
                                value={member.role}
                                onChange={(event) => handleRoleChange(member.id, event.target.value as Role)}
                                disabled={disableActions}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition disabled:cursor-not-allowed disabled:bg-white/10"
                              >
                                {ROLE_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                              {disableActions ? (
                                <p className="mt-2 text-[11px] text-neutral-500">
                                  {isViewer
                                    ? "Viewers cannot update workspace roles."
                                    : "Admins retain role changes for other admins."}
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-neutral-500">{member.joined}</td>
                          <td className="px-6 py-4 text-right space-x-2">
                            <button
                              type="button"
                              disabled={disableActions}
                              onClick={() => handleRemove(member.id)}
                              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition disabled:cursor-not-allowed disabled:border-neutral-700 disabled:text-neutral-500 hover:bg-white/10"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
