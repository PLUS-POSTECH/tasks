"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type DragEvent } from "react";

import { Icon } from "@/components/ui/icon";
import { setIssueAssignees, setIssuePriority } from "@/lib/issues/actions";
import { issuePath } from "@/lib/issues/reference";
import type { IssueListItem } from "@/lib/issues/types";
import { classNames } from "@/lib/utilities/class-names";

import { IssueAssigneePicker } from "./pickers/assignee-picker";
import { PriorityPicker } from "./pickers/priority-picker";

type IssueBoardCardProps = {
  readonly issue: IssueListItem;
  readonly dragging: boolean;
  readonly onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  readonly onDragEnd: () => void;
};

export const IssueBoardCard = ({
  issue,
  dragging,
  onDragStart,
  onDragEnd,
}: IssueBoardCardProps) => {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const href = issuePath(issue.number);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-issue-identifier={issue.identifier}
      onClick={() => router.push(href)}
      className={classNames(
        "group/card flex cursor-default flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:border-border-strong hover:shadow-popover",
        dragging ? "opacity-40" : "",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-2xs text-foreground-tertiary">{issue.reference}</span>
        {issue.isBlocked ? (
          <span title="Blocked" className="text-danger">
            <Icon name="block" size={12} />
          </span>
        ) : null}
        <span className="flex-1" />
        <IssueAssigneePicker
          value={issue.assignees}
          avatarSize={18}
          onChange={(assigneeIdentifiers) =>
            startTransition(() => setIssueAssignees(issue.identifier, assigneeIdentifiers))
          }
        />
      </div>
      <Link
        href={href}
        onClick={(event) => event.stopPropagation()}
        className="line-clamp-3 text-[13px] font-medium leading-5 text-foreground"
      >
        {issue.title}
      </Link>
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityPicker
          value={issue.priority}
          onSelect={(priority) =>
            startTransition(() => setIssuePriority(issue.identifier, priority))
          }
          className="h-5 w-5"
        />
        {issue.labels.map((label) => (
          <span
            key={label.identifier}
            className="inline-flex h-5 items-center gap-1 rounded-full border border-border px-1.5 text-2xs text-foreground-secondary"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: label.color }} />
            {label.name}
          </span>
        ))}
        {issue.project ? (
          <span
            className="inline-flex h-5 max-w-[140px] items-center gap-1 truncate rounded-full border border-border px-1.5 text-2xs text-foreground-secondary"
            title={issue.project.name}
          >
            <span style={{ color: issue.project.color }}>{issue.project.icon}</span>
            <span className="truncate">{issue.project.name}</span>
          </span>
        ) : null}
        {issue.subIssueCount > 0 ? (
          <span className="inline-flex h-5 items-center gap-1 rounded-full border border-border px-1.5 text-2xs text-foreground-tertiary">
            <Icon name="sub-issue" size={10} />
            {issue.completedSubIssueCount}/{issue.subIssueCount}
          </span>
        ) : null}
      </div>
    </div>
  );
};
