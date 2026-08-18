"use client";

import { useState, useTransition, type DragEvent } from "react";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import {
  moveIssueOnBoard,
  setIssueAssignee,
  setIssueLabels,
  setIssuePriority,
  setIssueProject,
} from "@/lib/issues/actions";
import { groupCreateDefaults, type IssueGroup } from "@/lib/issues/grouping";
import { placementForDrop } from "@/lib/issues/placement";
import { classNames } from "@/lib/utilities/class-names";

import { useCreateIssueDialog, type CreateIssueDefaults } from "./create-issue/create-issue-dialog-context";
import { GroupHeaderIcon } from "./group-header-icon";
import { IssueBoardCard } from "./issue-board-card";

type IssueBoardProps = {
  readonly groups: readonly IssueGroup[];
  readonly createDefaults?: CreateIssueDefaults;
};

const dragMimeType = "application/x-tasks-issue";

/** An issue can be in several label columns at once, so a drag carries the column it left. */
type BoardDrag = {
  readonly issueIdentifier: string;
  readonly sourceGroupKey: string;
};

export const IssueBoard = ({
  groups,
  createDefaults = {},
}: IssueBoardProps) => {
  const { openCreateIssue } = useCreateIssueDialog();
  const [, startTransition] = useTransition();
  const [drag, setDrag] = useState<BoardDrag | null>(null);
  const [dropTarget, setDropTarget] = useState<{ groupKey: string; index: number } | null>(null);

  /** Dropping into "No label" clears every label, because that column claims the issue has none. */
  const labelsAfterDrop = (
    target: IssueGroup,
    source: IssueGroup | undefined,
    issueIdentifier: string,
  ): readonly string[] => {
    if (target.header.kind !== "label" || target.header.label === null) {
      return [];
    }
    const targetLabelIdentifier = target.header.label.identifier;
    const sourceLabelIdentifier =
      source?.header.kind === "label" ? (source.header.label?.identifier ?? null) : null;
    const dragged = source?.issues.find((issue) => issue.identifier === issueIdentifier);
    const kept = (dragged?.labels ?? [])
      .map((label) => label.identifier)
      .filter(
        (identifier) =>
          identifier !== sourceLabelIdentifier && identifier !== targetLabelIdentifier,
      );
    return [...kept, targetLabelIdentifier];
  };

  const handleDrop = (group: IssueGroup, index: number) => {
    if (!drag) {
      return;
    }
    const orderedIssues = [...group.issues].sort((left, right) => left.boardOrder - right.boardOrder);
    const identifier = drag.issueIdentifier;
    // The board is ordered by `boardOrder` whatever it is grouped by, so every
    // one of these writes that order.
    const placement = placementForDrop(
      orderedIssues.map((issue) => issue.identifier),
      index,
      identifier,
    );
    const sourceGroup = groups.find((candidate) => candidate.key === drag.sourceGroupKey);
    setDrag(null);
    setDropTarget(null);
    startTransition(async () => {
      switch (group.header.kind) {
        case "state":
          await moveIssueOnBoard(identifier, group.header.state.identifier, placement);
          return;
        case "assignee":
          await setIssueAssignee(identifier, group.header.assignee?.identifier ?? null);
          await moveIssueOnBoard(identifier, null, placement);
          return;
        case "priority":
          await setIssuePriority(identifier, group.header.priority);
          await moveIssueOnBoard(identifier, null, placement);
          return;
        case "project":
          await setIssueProject(identifier, group.header.project?.identifier ?? null);
          await moveIssueOnBoard(identifier, null, placement);
          return;
        case "label":
          await setIssueLabels(identifier, labelsAfterDrop(group, sourceGroup, identifier));
          await moveIssueOnBoard(identifier, null, placement);
          return;
        default:
          await moveIssueOnBoard(identifier, null, placement);
      }
    });
  };

  const handleDragOver = (event: DragEvent<HTMLElement>, groupKey: string, count: number) => {
    if (!drag) {
      return;
    }
    event.preventDefault();
    const cards = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-issue-identifier]")];
    const index = cards.findIndex((card) => {
      const rect = card.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    setDropTarget({ groupKey, index: index === -1 ? count : index });
  };

  return (
    <div className="scrollbar-thin flex h-full min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4 pt-3">
      {groups.map((group) => {
        const orderedIssues = [...group.issues].sort((left, right) => left.boardOrder - right.boardOrder);
        const isTarget = dropTarget?.groupKey === group.key;
        return (
          <section
            key={group.key}
            aria-label={group.name}
            className={classNames(
              "flex w-[300px] shrink-0 flex-col rounded-lg bg-background-secondary",
              isTarget ? "ring-1 ring-accent/50" : "",
            )}
            onDragOver={(event) => handleDragOver(event, group.key, orderedIssues.length)}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDropTarget((current) => (current?.groupKey === group.key ? null : current));
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleDrop(group, dropTarget?.groupKey === group.key ? dropTarget.index : orderedIssues.length);
            }}
          >
            <header className="flex h-10 items-center gap-2 px-3">
              <span className="flex w-4 items-center justify-center">
                <GroupHeaderIcon header={group.header} />
              </span>
              <span className="truncate text-[13px] font-medium text-foreground">{group.name}</span>
              <span className="text-xs text-foreground-tertiary tabular-nums">{group.issues.length}</span>
              <span className="flex-1" />
              <IconButton
                size="compact"
                tone="muted"
                onClick={() =>
                  openCreateIssue(
                    // A board column has never pre-filled its label, unlike
                    // the list. Deliberate, not an oversight.
                    groupCreateDefaults(group, createDefaults, { prefillLabel: false }),
                  )
                }
                aria-label={`New issue in ${group.name}`}
              >
                <Icon name="plus" size={14} />
              </IconButton>
            </header>
            <div className="scrollbar-thin flex min-h-[80px] flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {orderedIssues.map((issue, index) => (
                <div key={issue.identifier} className="flex flex-col gap-2">
                  {isTarget && dropTarget.index === index ? (
                    <div className="h-0.5 rounded bg-accent" />
                  ) : null}
                  <IssueBoardCard
                    issue={issue}
                    dragging={drag?.issueIdentifier === issue.identifier}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(dragMimeType, issue.identifier);
                      event.dataTransfer.effectAllowed = "move";
                      setDrag({ issueIdentifier: issue.identifier, sourceGroupKey: group.key });
                    }}
                    onDragEnd={() => {
                      setDrag(null);
                      setDropTarget(null);
                    }}
                  />
                </div>
              ))}
              {isTarget && dropTarget.index >= orderedIssues.length ? (
                <div className="h-0.5 rounded bg-accent" />
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
};
