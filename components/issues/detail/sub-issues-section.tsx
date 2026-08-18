"use client";

import { IssueRow } from "@/components/issues/issue-row";
import { useCreateIssueDialog } from "@/components/issues/create-issue/create-issue-dialog-context";
import { Icon } from "@/components/ui/icon";
import { ProgressCircle } from "@/components/ui/progress-circle";
import type { IssueListItem } from "@/lib/issues/types";

type SubIssuesSectionProps = {
  readonly parentIdentifier: string;
  readonly parentReference: string;
  readonly projectIdentifier: string | null;
  readonly subIssues: readonly IssueListItem[];
};

export const SubIssuesSection = ({
  parentIdentifier,
  parentReference,
  projectIdentifier,
  subIssues,
}: SubIssuesSectionProps) => {
  const { openCreateIssue } = useCreateIssueDialog();
  const completed = subIssues.filter((issue) => issue.state.type === "completed").length;
  const progress = subIssues.length === 0 ? 0 : completed / subIssues.length;

  return (
    <section className="flex flex-col">
      <div className="flex h-8 items-center gap-2">
        <Icon name="sub-issue" size={14} className="text-foreground-tertiary" />
        <h2 className="text-[13px] font-medium text-foreground">Sub-issues</h2>
        {subIssues.length > 0 ? (
          <span className="flex items-center gap-1.5 text-xs text-foreground-tertiary">
            <ProgressCircle progress={progress} size={13} />
            {completed}/{subIssues.length}
          </span>
        ) : null}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() =>
            openCreateIssue({ parentIdentifier, parentReference, projectIdentifier })
          }
          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground"
        >
          <Icon name="plus" size={12} /> Add sub-issue
        </button>
      </div>
      {subIssues.length > 0 ? (
        <div role="grid" className="overflow-hidden rounded-lg border border-border">
          {subIssues.map((issue) => (
            <IssueRow key={issue.identifier} issue={issue} selectable={false} showProject={false} />
          ))}
        </div>
      ) : null}
    </section>
  );
};
