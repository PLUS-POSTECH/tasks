"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { groupCreateDefaults, type IssueGroup } from "@/lib/issues/grouping";
import { issuePath } from "@/lib/issues/reference";
import {
  emptyIssueSelection,
  sameIssueSet,
  selectedVisibleIdentifiers,
  toggleIssueSelection,
  type IssueSelection,
} from "@/lib/issues/selection";
import type { IssueListItem } from "@/lib/issues/types";
import { classNames } from "@/lib/utilities/class-names";
import { isEditableTarget, isOverlayOpen } from "@/lib/utilities/keyboard";

import { BulkActionBar } from "./bulk-action-bar";
import { useCreateIssueDialog, type CreateIssueDefaults } from "./create-issue/create-issue-dialog-context";
import { GroupHeaderIcon } from "./group-header-icon";
import { IssueRow, type IssueRowPicker } from "./issue-row";

type IssueListProps = {
  readonly groups: readonly IssueGroup[];
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly createDefaults?: CreateIssueDefaults;
  readonly loadMore?: ReactNode;
};

const pickerShortcuts: Readonly<Record<string, IssueRowPicker>> = {
  s: "state",
  p: "priority",
  a: "assignee",
  l: "labels",
  d: "due",
};

/**
 * The issue travels with the picker: the pointer crosses other rows on its way
 * to a menu that opens far to the left and each one it passes takes focus, so a
 * picker tied to whichever row is focused would edit the wrong issue.
 */
type OpenRowPicker = {
  readonly issueIdentifier: string;
  readonly picker: IssueRowPicker;
};

export const IssueList = ({
  groups,
  emptyTitle,
  emptyDescription,
  createDefaults = {},
  loadMore,
}: IssueListProps) => {
  const router = useRouter();
  const { openCreateIssue } = useCreateIssueDialog();
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());
  const [focusedIdentifier, setFocusedIdentifier] = useState<string | null>(null);
  const [selection, setSelection] = useState<IssueSelection>(emptyIssueSelection);
  const [openPicker, setOpenPicker] = useState<OpenRowPicker | null>(null);

  const visibleIssues = useMemo(
    (): readonly IssueListItem[] =>
      groups
        .filter((group) => !collapsedGroups.has(group.key))
        .flatMap((group) => group.issues),
    [groups, collapsedGroups],
  );
  const visibleIdentifiers = useMemo(
    (): readonly string[] => visibleIssues.map((issue) => issue.identifier),
    [visibleIssues],
  );
  const loadedIdentifiers = useMemo(
    (): readonly string[] => groups.flatMap((group) => group.issues.map((issue) => issue.identifier)),
    [groups],
  );
  const totalCount = groups.reduce((sum, group) => sum + group.issues.length, 0);

  // This list never remounts — every filter and paging change is a
  // `router.replace` on the same path — so a selection would otherwise ride
  // across all of them, invisible while the filter is narrow.
  const [previouslyLoadedIdentifiers, setPreviouslyLoadedIdentifiers] = useState(loadedIdentifiers);
  if (!sameIssueSet(previouslyLoadedIdentifiers, loadedIdentifiers)) {
    setPreviouslyLoadedIdentifiers(loadedIdentifiers);
    setSelection(emptyIssueSelection);
  }

  const focusedIndex = visibleIssues.findIndex(
    (issue) => issue.identifier === focusedIdentifier,
  );

  const toggleGroup = (key: string) =>
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  const toggleSelection = useCallback(
    (identifier: string, shiftKey: boolean) => {
      setSelection((current) => toggleIssueSelection(current, visibleIdentifiers, identifier, shiftKey));
    },
    [visibleIdentifiers],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      // The second key of a "G then a letter" sequence is spent on navigation.
      if (event.defaultPrevented) {
        return;
      }
      if (isOverlayOpen()) {
        return;
      }
      const moveFocus = (delta: number) => {
        if (visibleIssues.length === 0) {
          return;
        }
        const nextIndex =
          focusedIndex === -1
            ? delta > 0
              ? 0
              : visibleIssues.length - 1
            : Math.min(Math.max(focusedIndex + delta, 0), visibleIssues.length - 1);
        const next = visibleIssues[nextIndex];
        if (next) {
          setFocusedIdentifier(next.identifier);
          document
            .querySelector<HTMLElement>(`[data-issue-identifier="${next.identifier}"]`)
            ?.scrollIntoView({ block: "nearest" });
        }
      };
      switch (event.key) {
        case "j":
        case "ArrowDown":
          event.preventDefault();
          moveFocus(1);
          return;
        case "k":
        case "ArrowUp":
          event.preventDefault();
          moveFocus(-1);
          return;
        case "Enter": {
          const focused = visibleIssues[focusedIndex];
          if (focused) {
            event.preventDefault();
            router.push(issuePath(focused.number));
          }
          return;
        }
        case "x": {
          const focused = visibleIssues[focusedIndex];
          if (focused) {
            event.preventDefault();
            toggleSelection(focused.identifier, event.shiftKey);
          }
          return;
        }
        case "Escape":
          if (selection.identifiers.size > 0) {
            setSelection(emptyIssueSelection);
          } else {
            setFocusedIdentifier(null);
          }
          return;
        default: {
          const picker = pickerShortcuts[event.key];
          const focused = visibleIssues[focusedIndex];
          if (picker && focused) {
            event.preventDefault();
            setOpenPicker({ issueIdentifier: focused.identifier, picker });
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visibleIssues, focusedIndex, router, toggleSelection, selection.identifiers.size]);

  const selectedList = selectedVisibleIdentifiers(selection, visibleIdentifiers);

  // A page can be emptied by the completed issues this view hides rather than
  // by the filter, so the control belongs here too.
  if (totalCount === 0) {
    return (
      <>
        <EmptyState
          fill
          icon={<Icon name="issues" size={18} />}
          title={emptyTitle}
          description={emptyDescription}
          action={
            <button
              type="button"
              onClick={() => openCreateIssue(createDefaults)}
              className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-xs font-medium text-accent-foreground hover:bg-accent-hover"
            >
              <Icon name="plus" size={13} /> New issue
            </button>
          }
        />
        {loadMore}
      </>
    );
  }

  return (
    <div role="grid" aria-rowcount={totalCount} className="flex flex-col pb-24">
      {groups.map((group) => {
        const collapsed = collapsedGroups.has(group.key);
        return (
          <section key={group.key} aria-label={group.name} className="group/section">
            <div className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-border-subtle bg-background-secondary/95 px-3 backdrop-blur">
              <button
                type="button"
                onClick={() => toggleGroup(group.key)}
                aria-expanded={!collapsed}
                className="flex min-w-0 items-center gap-2 rounded px-1 py-0.5 text-[13px] font-medium text-foreground hover:bg-background-tertiary"
              >
                <span className="flex w-4 items-center justify-center">
                  <GroupHeaderIcon header={group.header} />
                </span>
                <span className="truncate">{group.name}</span>
                <span className="text-xs font-normal text-foreground-tertiary tabular-nums">
                  {group.issues.length}
                </span>
                <Icon
                  name="chevron-down"
                  size={12}
                  className={classNames(
                    "text-foreground-quaternary transition-transform",
                    collapsed ? "-rotate-90" : "",
                  )}
                />
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => openCreateIssue(groupCreateDefaults(group, createDefaults, { prefillLabel: true }))}
                aria-label={`New issue in ${group.name}`}
                className="flex h-6 w-6 items-center justify-center rounded text-foreground-tertiary transition-opacity hover:bg-background-tertiary hover:text-foreground focus-visible:opacity-100 md:opacity-0 md:group-hover/section:opacity-100"
              >
                <Icon name="plus" size={14} />
              </button>
            </div>
            {collapsed
              ? null
              : group.issues.map((issue) => (
                  <IssueRow
                    key={issue.identifier}
                    issue={issue}
                    focused={focusedIdentifier === issue.identifier}
                    selected={selection.identifiers.has(issue.identifier)}
                    onFocus={() => setFocusedIdentifier(issue.identifier)}
                    onToggleSelect={(shiftKey) => toggleSelection(issue.identifier, shiftKey)}
                    activePicker={
                      openPicker?.issueIdentifier === issue.identifier ? openPicker.picker : null
                    }
                    onPickerOpenChange={(picker, open) => {
                      if (
                        !open &&
                        openPicker?.issueIdentifier === issue.identifier &&
                        openPicker.picker === picker
                      ) {
                        setOpenPicker(null);
                      }
                    }}
                    showProject
                  />
                ))}
          </section>
        );
      })}
      {loadMore}
      {selectedList.length > 0 ? (
        <BulkActionBar
          selectedIdentifiers={selectedList}
          onClear={() => setSelection(emptyIssueSelection)}
        />
      ) : null}
    </div>
  );
};
