"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Popover } from "@/components/ui/popover";
import { issueViewOptionsPatch, type IssueGrouping, type IssueOrdering, type IssueViewOptions } from "@/lib/issues/filters";
import { classNames } from "@/lib/utilities/class-names";

import { useIssueViewUrl } from "./use-issue-view-url";

type DisplayOptionsMenuProps = {
  readonly options: IssueViewOptions;
  readonly allowBoard?: boolean;
  readonly groupingChoices?: readonly IssueGrouping[];
};

const groupingLabels: Readonly<Record<IssueGrouping, string>> = {
  state: "Status",
  assignee: "Assignee",
  priority: "Priority",
  project: "Project",
  label: "Label",
  none: "No grouping",
};

const orderingLabels: Readonly<Record<IssueOrdering, string>> = {
  manual: "Manual",
  priority: "Priority",
  created: "Created",
  updated: "Last updated",
  due: "Due date",
  title: "Title",
};

const orderingChoices: readonly IssueOrdering[] = ["priority", "manual", "created", "updated", "due", "title"];

export const DisplayOptionsMenu = ({
  options,
  allowBoard = true,
  groupingChoices = ["state", "assignee", "priority", "project", "label", "none"],
}: DisplayOptionsMenuProps) => {
  const { update } = useIssueViewUrl();

  /**
   * A URL may name a grouping this page does not offer, and the list honours
   * it, so the grouping actually applied is always listed.
   */
  const groupings = groupingChoices.includes(options.grouping)
    ? groupingChoices
    : [...groupingChoices, options.grouping];

  return (
    <Popover
      align="end"
      trigger={
        <Button variant="ghost" size="small" leadingIcon={<Icon name="sliders" size={13} />}>
          Display
        </Button>
      }
    >
      <div className="flex w-[300px] flex-col gap-3 p-3 text-[13px]">
        {allowBoard ? (
          <div className="grid grid-cols-2 gap-1 rounded-md bg-background-tertiary p-0.5">
            {(["list", "board"] as const).map((layout) => (
              <button
                key={layout}
                type="button"
                onClick={() => update(issueViewOptionsPatch({ layout }))}
                className={classNames(
                  "flex h-7 items-center justify-center gap-1.5 rounded text-xs font-medium",
                  options.layout === layout
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-foreground-tertiary hover:text-foreground",
                )}
              >
                <Icon name={layout === "list" ? "list" : "board"} size={13} />
                {layout === "list" ? "List" : "Board"}
              </button>
            ))}
          </div>
        ) : null}

        <label className="flex items-center justify-between gap-3">
          <span className="text-foreground-secondary">Grouping</span>
          <select
            value={options.grouping}
            onChange={(event) => update(issueViewOptionsPatch({ grouping: event.target.value as IssueGrouping }))}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none"
          >
            {groupings.map((grouping) => (
              <option key={grouping} value={grouping}>
                {groupingLabels[grouping]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center justify-between gap-3">
          <span className="text-foreground-secondary">Ordering</span>
          <select
            value={options.ordering}
            onChange={(event) => update(issueViewOptionsPatch({ ordering: event.target.value as IssueOrdering }))}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none"
          >
            {orderingChoices.map((ordering) => (
              <option key={ordering} value={ordering}>
                {orderingLabels[ordering]}
              </option>
            ))}
          </select>
        </label>

        <div className="h-px bg-border" />

        <label className="flex items-center justify-between gap-3">
          <span className="text-foreground-secondary">Show completed issues</span>
          <input
            type="checkbox"
            checked={options.showCompleted}
            onChange={(event) => update(issueViewOptionsPatch({ showCompleted: event.target.checked }))}
            className="h-3.5 w-3.5 accent-accent"
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-foreground-secondary">Show empty groups</span>
          <input
            type="checkbox"
            checked={options.showEmptyGroups}
            onChange={(event) => update(issueViewOptionsPatch({ showEmptyGroups: event.target.checked }))}
            className="h-3.5 w-3.5 accent-accent"
          />
        </label>
      </div>
    </Popover>
  );
};
