"use client";

import { Icon } from "@/components/ui/icon";
import { useWorkspaceData } from "@/components/workspace/workspace-data-provider";
import { priorityName } from "@/lib/issues/priority";

import {
  filterMeToken,
  filterNoneToken,
  issueFilterCategories,
  type IssueFilterCategory,
} from "@/lib/issues/filters";

import { useIssueViewUrl } from "./use-issue-view-url";

type Chip = {
  readonly key: string;
  readonly label: string;
  readonly values: readonly string[];
};

export const ActiveFilterChips = () => {
  const { states, members, labels, projects, currentUser } = useWorkspaceData();
  const { listOf, update, get, clearFilters } = useIssueViewUrl();

  const nameOfMember = (identifier: string): string =>
    identifier === filterMeToken
      ? `${currentUser.name}`
      : identifier === filterNoneToken
        ? "No assignee"
        : members.find((member) => member.identifier === identifier)?.name ?? "Unknown";

  const chipLabelOf = (key: IssueFilterCategory): string =>
    issueFilterCategories.find((entry) => entry.key === key)?.chipLabel ?? key;

  const chips: readonly Chip[] = [
    {
      key: "state",
      label: chipLabelOf("state"),
      values: listOf("state").map(
        (identifier) => states.find((state) => state.identifier === identifier)?.name ?? "Unknown",
      ),
    },
    { key: "assignee", label: chipLabelOf("assignee"), values: listOf("assignee").map(nameOfMember) },
    { key: "creator", label: chipLabelOf("creator"), values: listOf("creator").map(nameOfMember) },
    { key: "priority", label: chipLabelOf("priority"), values: listOf("priority").map((value) => priorityName(Number(value))) },
    {
      key: "label",
      label: chipLabelOf("label"),
      values: listOf("label").map(
        (identifier) => labels.find((label) => label.identifier === identifier)?.name ?? "Unknown",
      ),
    },
    {
      key: "project",
      label: chipLabelOf("project"),
      values: listOf("project").map((identifier) =>
        identifier === filterNoneToken
          ? "No project"
          : projects.find((project) => project.identifier === identifier)?.name ?? "Unknown",
      ),
    },
  ].filter((chip) => chip.values.length > 0);

  const query = get("q");
  if (chips.length === 0 && !query) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2">
      {query ? (
        <span className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background-secondary pl-2 pr-1 text-xs">
          <span className="text-foreground-tertiary">Search</span>
          <span className="font-medium text-foreground">“{query}”</span>
          <button
            type="button"
            onClick={() => update({ q: null })}
            aria-label="Remove search"
            className="ml-0.5 rounded p-0.5 text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground"
          >
            <Icon name="close" size={11} />
          </button>
        </span>
      ) : null}
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background-secondary pl-2 pr-1 text-xs"
        >
          <span className="text-foreground-tertiary">{chip.label}</span>
          <span className="text-foreground-tertiary">{chip.values.length > 1 ? "is any of" : "is"}</span>
          <span className="max-w-[240px] truncate font-medium text-foreground">{chip.values.join(", ")}</span>
          <button
            type="button"
            onClick={() => update({ [chip.key]: null })}
            aria-label={`Remove ${chip.label} filter`}
            className="ml-0.5 rounded p-0.5 text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground"
          >
            <Icon name="close" size={11} />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={clearFilters}
        className="ml-1 text-xs text-foreground-tertiary hover:text-foreground"
      >
        Clear
      </button>
    </div>
  );
};
