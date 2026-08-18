"use client";

import { useCallback, useEffect, useMemo, type ReactNode } from "react";

import { isEditableTarget, isOverlayOpen } from "@/lib/utilities/keyboard";

import { useLazyOverlay } from "@/components/ui/use-lazy-overlay";

import {
  CreateIssueDialogContext,
  type CreateIssueDefaults,
} from "./create-issue-dialog-context";

type CreateIssueDialogPayload = {
  readonly defaults: CreateIssueDefaults;
};

type CreateIssueDialogProviderProps = {
  readonly children: ReactNode;
};

export const CreateIssueDialogProvider = ({ children }: CreateIssueDialogProviderProps) => {
  const { openOverlay, overlay } = useLazyOverlay<CreateIssueDialogPayload>(
    () => import("./create-issue-dialog"),
  );

  const openCreateIssue = useCallback(
    (defaults: CreateIssueDefaults = {}) => openOverlay({ defaults }),
    [openOverlay],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "c" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (isEditableTarget(event.target) || isOverlayOpen()) {
        return;
      }
      event.preventDefault();
      openCreateIssue();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openCreateIssue]);

  const value = useMemo(() => ({ openCreateIssue }), [openCreateIssue]);

  return (
    <CreateIssueDialogContext.Provider value={value}>
      {children}
      {overlay}
    </CreateIssueDialogContext.Provider>
  );
};
