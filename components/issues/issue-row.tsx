"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { Icon } from "@/components/ui/icon";
import {
  setIssueAssignee,
  setIssueDueDate,
  setIssueLabels,
  setIssuePriority,
  setIssueProject,
  setIssueState,
} from "@/lib/issues/actions";
import { issuePath } from "@/lib/issues/reference";
import type { IssueListItem } from "@/lib/issues/types";
import { classNames } from "@/lib/utilities/class-names";

import { AssigneePicker } from "./pickers/assignee-picker";
import { DueDatePicker } from "./pickers/due-date-picker";
import { LabelPicker } from "./pickers/label-picker";
import { PriorityPicker } from "./pickers/priority-picker";
import { ProjectPicker } from "./pickers/project-picker";
import { StatePicker } from "./pickers/state-picker";
import { Timestamp } from "@/components/ui/timestamp";

export type IssueRowPicker =
  | "state"
  | "priority"
  | "assignee"
  | "labels"
  | "project"
  | "due";

type IssueRowProps = {
  readonly issue: IssueListItem;
  readonly focused?: boolean;
  readonly selected?: boolean;
  readonly selectable?: boolean;
  readonly onFocus?: () => void;
  readonly onToggleSelect?: (shiftKey: boolean) => void;
  readonly activePicker?: IssueRowPicker | null;
  readonly onPickerOpenChange?: (picker: IssueRowPicker, open: boolean) => void;
  readonly showProject?: boolean;
};

export const IssueRow = ({
  issue,
  focused = false,
  selected = false,
  selectable = true,
  onFocus,
  onToggleSelect,
  activePicker = null,
  onPickerOpenChange,
  showProject = true,
}: IssueRowProps) => {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const href = issuePath(issue.number);

  const navigate = () => router.push(href);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      navigate();
    }
  };

  const pickerProps = (picker: IssueRowPicker) => ({
    open: activePicker === picker ? true : undefined,
    onOpenChange: (open: boolean) => onPickerOpenChange?.(picker, open),
  });

  return (
    <div
      role="row"
      tabIndex={-1}
      data-issue-identifier={issue.identifier}
      data-focused={focused || undefined}
      aria-selected={selected || undefined}
      onMouseEnter={onFocus}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey) {
          window.open(href, "_blank", "noopener");
          return;
        }
        if (event.shiftKey && onToggleSelect) {
          event.preventDefault();
          onToggleSelect(true);
          return;
        }
        navigate();
      }}
      onKeyDown={handleKeyDown}
      className={classNames(
        "group/row relative flex h-[38px] cursor-default select-none items-center gap-2 border-b border-border-subtle pl-3 pr-4 text-[13px] outline-none transition-colors",
        focused ? "bg-background-secondary" : "hover:bg-background-secondary",
        selected ? "bg-selection hover:bg-selection" : "",
      )}
    >
      {selectable ? (
        <span
          className={classNames(
            "flex w-4 shrink-0 items-center justify-center",
            selected ? "opacity-100" : "md:opacity-0 md:group-hover/row:opacity-100",
          )}
        >
          <input
            type="checkbox"
            aria-label={`Select ${issue.reference}`}
            checked={selected}
            onClick={(event) => event.stopPropagation()}
            onChange={() => onToggleSelect?.(false)}
            className="h-3.5 w-3.5 cursor-default accent-accent"
          />
        </span>
      ) : null}

      <PriorityPicker
        value={issue.priority}
        onSelect={(priority) =>
          startTransition(() => setIssuePriority(issue.identifier, priority))
        }
        {...pickerProps("priority")}
      />

      <span className="hidden w-[52px] shrink-0 truncate font-mono text-xs text-foreground-tertiary tabular-nums sm:inline">
        {issue.reference}
      </span>

      <StatePicker
        value={issue.state}
        onSelect={(stateIdentifier) =>
          startTransition(() => setIssueState(issue.identifier, stateIdentifier))
        }
        {...pickerProps("state")}
      />

      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {issue.parent ? (
          <span
            className="hidden max-w-[120px] shrink-0 truncate text-xs text-foreground-quaternary md:inline"
            title={issue.parent.title}
          >
            {issue.parent.reference}
            <span className="mx-1">›</span>
          </span>
        ) : null}
        <Link
          href={href}
          onClick={(event) => event.stopPropagation()}
          className="truncate font-medium text-foreground hover:underline decoration-border-strong underline-offset-2"
        >
          {issue.title}
        </Link>
        {issue.isBlocked ? (
          <span title="Blocked" className="text-danger">
            <Icon name="block" size={13} />
          </span>
        ) : null}
        {issue.subIssueCount > 0 ? (
          <span
            className="hidden items-center gap-1 rounded border border-border px-1 text-2xs text-foreground-tertiary sm:inline-flex"
            title="Sub-issues"
          >
            <Icon name="sub-issue" size={10} />
            {issue.completedSubIssueCount}/{issue.subIssueCount}
          </span>
        ) : null}
        {issue.commentCount > 0 ? (
          <span className="hidden items-center gap-0.5 text-2xs text-foreground-quaternary lg:inline-flex" title="Comments">
            <Icon name="comment" size={11} />
            {issue.commentCount}
          </span>
        ) : null}
      </div>

      <div className="hidden shrink-0 items-center gap-1.5 md:flex">
        {issue.labels.length > 0 || activePicker === "labels" ? (
          <LabelPicker
            value={issue.labels}
            onChange={(labelIdentifiers) =>
              startTransition(() => setIssueLabels(issue.identifier, labelIdentifiers))
            }
            {...pickerProps("labels")}
          />
        ) : null}
        {showProject && (issue.project || activePicker === "project") ? (
          <ProjectPicker
            value={issue.project}
            onSelect={(projectIdentifier) =>
              startTransition(() => setIssueProject(issue.identifier, projectIdentifier))
            }
            className="max-w-[160px]"
            {...pickerProps("project")}
          />
        ) : null}
        {issue.dueDate || activePicker === "due" ? (
          <DueDatePicker
            value={issue.dueDate}
            onSelect={(dueDate) =>
              startTransition(() => setIssueDueDate(issue.identifier, dueDate))
            }
            className="border-transparent"
            {...pickerProps("due")}
          />
        ) : null}
      </div>

      <Timestamp
        value={issue.createdAt}
        format="compact"
        className="hidden w-10 shrink-0 text-right text-xs text-foreground-quaternary tabular-nums sm:inline"
      />

      <AssigneePicker
        value={issue.assignee}
        onSelect={(assigneeIdentifier) =>
          startTransition(() => setIssueAssignee(issue.identifier, assigneeIdentifier))
        }
        avatarSize={18}
        {...pickerProps("assignee")}
      />
    </div>
  );
};
