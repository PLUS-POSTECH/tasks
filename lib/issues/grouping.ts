import type { CreateIssueDefaults } from "@/components/issues/create-issue/create-issue-dialog-context";
import { compareWorkflowStatesForDisplay } from "@/lib/workflow/state-types";

import type { IssueGrouping, IssueOrdering } from "./filters";
import type { Priority } from "@/lib/database/schema";

import { priorityDefinitions, prioritySortKey } from "./priority";
import type { IssueListItem } from "./types";
import type { LabelSummary } from "@/lib/labels/types";
import type { ProjectSummary } from "@/lib/projects/types";
import type { UserSummary } from "@/lib/users/types";
import type { IssueStateSummary } from "@/lib/workflow/types";

export type IssueGroupHeader =
  | { readonly kind: "state"; readonly state: IssueStateSummary }
  | { readonly kind: "assignee"; readonly assignee: UserSummary | null }
  | { readonly kind: "priority"; readonly priority: Priority }
  | { readonly kind: "project"; readonly project: ProjectSummary | null }
  | { readonly kind: "label"; readonly label: LabelSummary | null }
  | { readonly kind: "none" };

export type IssueGroup = {
  readonly key: string;
  readonly name: string;
  readonly header: IssueGroupHeader;
  readonly issues: readonly IssueListItem[];
};

const compareText = (left: string, right: string): number =>
  left.localeCompare(right, "en", { sensitivity: "base" });

const compareIssues = (
  ordering: IssueOrdering,
): ((left: IssueListItem, right: IssueListItem) => number) => {
  switch (ordering) {
    case "manual":
      return (left, right) =>
        left.sortOrder - right.sortOrder ||
        right.createdAt.getTime() - left.createdAt.getTime();
    case "priority":
      return (left, right) =>
        prioritySortKey(left.priority) - prioritySortKey(right.priority) ||
        left.sortOrder - right.sortOrder ||
        right.createdAt.getTime() - left.createdAt.getTime();
    case "created":
      return (left, right) =>
        right.createdAt.getTime() - left.createdAt.getTime();
    case "updated":
      return (left, right) =>
        right.updatedAt.getTime() - left.updatedAt.getTime();
    case "due":
      return (left, right) => {
        if (left.dueDate && right.dueDate) {
          return compareText(left.dueDate, right.dueDate);
        }
        if (left.dueDate) {
          return -1;
        }
        if (right.dueDate) {
          return 1;
        }
        return left.sortOrder - right.sortOrder;
      };
    case "title":
      return (left, right) => compareText(left.title, right.title);
  }
};

const sortIssues = (
  issues: readonly IssueListItem[],
  ordering: IssueOrdering,
): readonly IssueListItem[] => [...issues].sort(compareIssues(ordering));

type GroupingContext = {
  readonly states: readonly IssueStateSummary[];
  readonly showEmptyGroups: boolean;
};

const groupBy = <TKey>(
  issues: readonly IssueListItem[],
  keyOf: (issue: IssueListItem) => TKey,
): ReadonlyMap<TKey, readonly IssueListItem[]> => {
  const buckets = new Map<TKey, IssueListItem[]>();
  for (const issue of issues) {
    const key = keyOf(issue);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(issue);
    } else {
      buckets.set(key, [issue]);
    }
  }
  return buckets;
};

const groupByState = (
  issues: readonly IssueListItem[],
  context: GroupingContext,
): readonly IssueGroup[] => {
  const buckets = groupBy(issues, (issue) => issue.state.identifier);
  const knownStates = new Map<string, IssueStateSummary>(
    context.states.map((state) => [state.identifier, state]),
  );
  for (const issue of issues) {
    knownStates.set(issue.state.identifier, issue.state);
  }
  return [...knownStates.values()]
    .sort(compareWorkflowStatesForDisplay)
    .map((state) => ({
      key: state.identifier,
      name: state.name,
      header: { kind: "state" as const, state },
      issues: buckets.get(state.identifier) ?? [],
    }))
    .filter((group) => context.showEmptyGroups || group.issues.length > 0);
};

const groupByAssignee = (
  issues: readonly IssueListItem[],
): readonly IssueGroup[] => {
  const assignees = new Map<string, UserSummary>();
  const buckets = new Map<string, IssueListItem[]>();
  const unassigned: IssueListItem[] = [];
  for (const issue of issues) {
    if (issue.assignees.length === 0) {
      unassigned.push(issue);
      continue;
    }
    for (const assignee of issue.assignees) {
      assignees.set(assignee.identifier, assignee);
      const bucket = buckets.get(assignee.identifier);
      if (bucket) {
        bucket.push(issue);
      } else {
        buckets.set(assignee.identifier, [issue]);
      }
    }
  }
  const named = [...assignees.values()]
    .sort((left, right) => compareText(left.name, right.name))
    .map((assignee) => ({
      key: assignee.identifier,
      name: assignee.name,
      header: { kind: "assignee" as const, assignee },
      issues: buckets.get(assignee.identifier) ?? [],
    }));
  return unassigned.length > 0
    ? [
        ...named,
        {
          key: "unassigned",
          name: "No assignee",
          header: { kind: "assignee" as const, assignee: null },
          issues: unassigned,
        },
      ]
    : named;
};

const groupByPriority = (
  issues: readonly IssueListItem[],
  context: GroupingContext,
): readonly IssueGroup[] => {
  const buckets = groupBy(issues, (issue) => issue.priority);
  return [...priorityDefinitions]
    .sort(
      (left, right) =>
        prioritySortKey(left.value) - prioritySortKey(right.value),
    )
    .map((definition) => ({
      key: `priority-${definition.value}`,
      name: definition.name,
      header: { kind: "priority" as const, priority: definition.value },
      issues: buckets.get(definition.value) ?? [],
    }))
    .filter((group) => context.showEmptyGroups || group.issues.length > 0);
};

const groupByProject = (
  issues: readonly IssueListItem[],
): readonly IssueGroup[] => {
  const buckets = groupBy(issues, (issue) => issue.project?.identifier ?? "");
  const projects = new Map<string, ProjectSummary>();
  for (const issue of issues) {
    if (issue.project) {
      projects.set(issue.project.identifier, issue.project);
    }
  }
  const named = [...projects.values()]
    .sort((left, right) => compareText(left.name, right.name))
    .map((project) => ({
      key: project.identifier,
      name: project.name,
      header: { kind: "project" as const, project },
      issues: buckets.get(project.identifier) ?? [],
    }));
  const withoutProject = buckets.get("");
  return withoutProject
    ? [
        ...named,
        {
          key: "no-project",
          name: "No project",
          header: { kind: "project" as const, project: null },
          issues: withoutProject,
        },
      ]
    : named;
};

const groupByLabel = (issues: readonly IssueListItem[]): readonly IssueGroup[] => {
  const labels = new Map<string, LabelSummary>();
  const buckets = new Map<string, IssueListItem[]>();
  const unlabeled: IssueListItem[] = [];
  for (const issue of issues) {
    if (issue.labels.length === 0) {
      unlabeled.push(issue);
      continue;
    }
    for (const label of issue.labels) {
      labels.set(label.identifier, label);
      const bucket = buckets.get(label.identifier);
      if (bucket) {
        bucket.push(issue);
      } else {
        buckets.set(label.identifier, [issue]);
      }
    }
  }
  const named = [...labels.values()]
    .sort((left, right) => compareText(left.name, right.name))
    .map((label) => ({
      key: label.identifier,
      name: label.name,
      header: { kind: "label" as const, label },
      issues: buckets.get(label.identifier) ?? [],
    }));
  return unlabeled.length > 0
    ? [
        ...named,
        {
          key: "no-label",
          name: "No label",
          header: { kind: "label" as const, label: null },
          issues: unlabeled,
        },
      ]
    : named;
};

export const groupIssues = (
  issues: readonly IssueListItem[],
  grouping: IssueGrouping,
  ordering: IssueOrdering,
  context: GroupingContext,
): readonly IssueGroup[] => {
  const sorted = sortIssues(issues, ordering);
  switch (grouping) {
    case "state":
      return groupByState(sorted, context);
    case "assignee":
      return groupByAssignee(sorted);
    case "priority":
      return groupByPriority(sorted, context);
    case "project":
      return groupByProject(sorted);
    case "label":
      return groupByLabel(sorted);
    case "none":
      return [
        {
          key: "all",
          name: "All issues",
          header: { kind: "none" },
          issues: sorted,
        },
      ];
  }
};

type GroupCreateDefaultsOptions = {
  /** The list pre-fills a label group's label; the board deliberately does not. */
  readonly prefillLabel: boolean;
};

export const groupCreateDefaults = (
  group: IssueGroup,
  base: CreateIssueDefaults,
  { prefillLabel }: GroupCreateDefaultsOptions,
): CreateIssueDefaults => {
  switch (group.header.kind) {
    case "state":
      return { ...base, stateIdentifier: group.header.state.identifier };
    case "assignee":
      return { ...base, assigneeIdentifier: group.header.assignee?.identifier ?? null };
    case "priority":
      return { ...base, priority: group.header.priority };
    case "project":
      return { ...base, projectIdentifier: group.header.project?.identifier ?? null };
    case "label":
      return prefillLabel && group.header.label
        ? { ...base, labelIdentifiers: [group.header.label.identifier] }
        : base;
    case "none":
      return base;
  }
};
