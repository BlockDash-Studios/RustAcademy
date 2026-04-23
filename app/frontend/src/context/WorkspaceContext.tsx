"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type WorkspaceRole = "Admin" | "Operator" | "Viewer";

export type Workspace = {
  id: string;
  name: string;
  namespace: string;
  role: WorkspaceRole;
  balance: string;
  activeLinks: number;
  members: number;
  privacyEnabled: boolean;
  description: string;
};

const SAVED_WORKSPACE_KEY = "quickex_workspace_id";

const DEFAULT_WORKSPACES: Workspace[] = [
  {
    id: "pulsefy-studios",
    name: "Pulsefy Studios",
    namespace: "pulsefy",
    role: "Admin",
    balance: "4,220.70 USDC",
    activeLinks: 12,
    members: 5,
    privacyEnabled: true,
    description: "Primary revenue workspace for contract payments and privacy-enabled links.",
  },
  {
    id: "pulsefy-labs",
    name: "Pulsefy Labs",
    namespace: "labs",
    role: "Operator",
    balance: "1,120.00 XLM",
    activeLinks: 7,
    members: 3,
    privacyEnabled: false,
    description: "Proof-of-concept workspace for new X-Ray and marketplace features.",
  },
  {
    id: "pulsefy-donations",
    name: "Pulsefy Donations",
    namespace: "donations",
    role: "Viewer",
    balance: "320.00 USDC",
    activeLinks: 4,
    members: 2,
    privacyEnabled: true,
    description: "Read-only workspace for reporting, audit, and donation tracking.",
  },
];

type WorkspaceContextValue = {
  workspaces: Workspace[];
  currentWorkspace: Workspace;
  switchWorkspace: (workspaceId: string) => void;
  isAdmin: boolean;
  isOperator: boolean;
  isViewer: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces] = useState<Workspace[]>(DEFAULT_WORKSPACES);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(workspaces[0].id);

  useEffect(() => {
    const stored = window.localStorage.getItem(SAVED_WORKSPACE_KEY);
    if (stored && workspaces.some((workspace) => workspace.id === stored)) {
      setSelectedWorkspaceId(stored);
    }
  }, [workspaces]);

  useEffect(() => {
    window.localStorage.setItem(SAVED_WORKSPACE_KEY, selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0],
    [selectedWorkspaceId, workspaces],
  );

  const contextValue: WorkspaceContextValue = useMemo(
    () => ({
      workspaces,
      currentWorkspace,
      switchWorkspace: setSelectedWorkspaceId,
      isAdmin: currentWorkspace.role === "Admin",
      isOperator: currentWorkspace.role === "Operator",
      isViewer: currentWorkspace.role === "Viewer",
    }),
    [currentWorkspace, workspaces],
  );

  return <WorkspaceContext.Provider value={contextValue}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}
