"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { LabelSummary } from "@/lib/labels/types";
import type { ProjectSummary } from "@/lib/projects/types";
import type { UserSummary } from "@/lib/users/types";
import type { IssueStateSummary } from "@/lib/workflow/types";
import type { CurrentUser } from "@/lib/session/current-user";

export type WorkspaceData = {
  readonly currentUser: CurrentUser;
  /**
   * Calendar dates are judged in the workspace's zone rather than in whichever
   * zone the runtime happens to be in, so the server and the browser have to be
   * told the same one.
   */
  readonly timeZone: string;
  readonly members: readonly UserSummary[];
  readonly labels: readonly LabelSummary[];
  readonly projects: readonly ProjectSummary[];
  readonly states: readonly IssueStateSummary[];
};

const WorkspaceDataContext = createContext<WorkspaceData | null>(null);

type WorkspaceDataProviderProps = {
  readonly value: WorkspaceData;
  readonly children: ReactNode;
};

export const WorkspaceDataProvider = ({
  value,
  children,
}: WorkspaceDataProviderProps) => (
  <WorkspaceDataContext.Provider value={value}>
    {children}
  </WorkspaceDataContext.Provider>
);

export const useWorkspaceData = (): WorkspaceData => {
  const context = useContext(WorkspaceDataContext);
  if (!context) {
    throw new Error("useWorkspaceData must be used inside WorkspaceDataProvider.");
  }
  return context;
};
