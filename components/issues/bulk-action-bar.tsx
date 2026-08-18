"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import { bulkUpdateIssues } from "@/lib/issues/actions";

import { IssueAssigneePicker } from "./pickers/assignee-picker";
import { PriorityPicker } from "./pickers/priority-picker";
import { ProjectPicker } from "./pickers/project-picker";
import { StatePicker } from "./pickers/state-picker";

type BulkActionBarProps = {
  readonly selectedIdentifiers: readonly string[];
  readonly onClear: () => void;
};

export const BulkActionBar = ({
  selectedIdentifiers,
  onClear,
}: BulkActionBarProps) => {
  const [pending, startTransition] = useTransition();
  const [applyError, setApplyError] = useState<string | null>(null);
  const count = selectedIdentifiers.length;

  // `bulkUpdateIssues` applies the whole batch or none of it, and says which.
  const apply = (patch: Parameters<typeof bulkUpdateIssues>[1]) =>
    startTransition(async () => {
      const result = await bulkUpdateIssues(selectedIdentifiers, patch);
      setApplyError(result.ok ? null : result.error);
    });

  return (
    <div className="pointer-events-auto fixed bottom-5 left-1/2 z-40 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-lg bg-surface-raised px-2 py-1.5 shadow-popover animate-slide-up">
      <span className="mr-1 flex items-center gap-1.5 rounded-md bg-accent-muted px-2 py-1 text-xs font-medium text-accent">
        {count} selected
        <button
          type="button"
          onClick={onClear}
          className="rounded p-0.5 hover:bg-background-quaternary"
          aria-label="Clear selection"
        >
          <Icon name="close" size={11} />
        </button>
      </span>
      <StatePicker
        value={null}
        variant="chip"
        onSelect={(stateIdentifier) => apply({ stateIdentifier })}
      />
      <PriorityPicker
        value={0}
        variant="chip"
        onSelect={(priority) => apply({ priority })}
      />
      <IssueAssigneePicker
        value={[]}
        variant="chip"
        onChange={(assigneeIdentifiers) => apply({ assigneeIdentifiers: [...assigneeIdentifiers] })}
      />
      <ProjectPicker
        value={null}
        variant="chip"
        onSelect={(projectIdentifier) => apply({ projectIdentifier })}
      />
      {pending ? (
        <Icon name="spinner" size={14} className="ml-1 animate-spin text-foreground-tertiary" />
      ) : null}
      {applyError ? <p className="ml-1 max-w-[260px] text-xs text-danger">{applyError}</p> : null}
    </div>
  );
};
