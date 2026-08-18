"use client";

import { createContext, useContext } from "react";

import type { Priority } from "@/lib/database/schema";

export type CreateIssueDefaults = {
  readonly stateIdentifier?: string;
  readonly priority?: Priority;
  readonly assigneeIdentifier?: string | null;
  readonly labelIdentifiers?: readonly string[];
  readonly projectIdentifier?: string | null;
  readonly parentIdentifier?: string | null;
  readonly parentReference?: string;
  readonly title?: string;
};

export type CreateIssueDialogContextValue = {
  readonly openCreateIssue: (defaults?: CreateIssueDefaults) => void;
};

export const CreateIssueDialogContext =
  createContext<CreateIssueDialogContextValue | null>(null);

export const useCreateIssueDialog = (): CreateIssueDialogContextValue => {
  const context = useContext(CreateIssueDialogContext);
  if (!context) {
    throw new Error(
      "useCreateIssueDialog must be used inside CreateIssueDialogProvider.",
    );
  }
  return context;
};
