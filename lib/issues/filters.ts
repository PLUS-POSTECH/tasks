import type { WorkflowStateType } from "@/lib/database/schema";
import { workflowStateTypes } from "@/lib/database/schema/enum-values";

import { isPriority } from "./priority";
import type { Priority } from "@/lib/database/schema";

const issueGroupings = [
  "state",
  "assignee",
  "priority",
  "project",
  "label",
  "none",
] as const;

export type IssueGrouping = (typeof issueGroupings)[number];

const issueOrderings = [
  "manual",
  "priority",
  "created",
  "updated",
  "due",
  "title",
] as const;

export type IssueOrdering = (typeof issueOrderings)[number];

const issueLayouts = ["list", "board"] as const;

export type IssueLayout = (typeof issueLayouts)[number];

/**
 * Tokens a filter list may hold instead of an identifier: `none` selects the
 * rows with nothing set, `me` is resolved once the current member is known.
 */
export const filterNoneToken = "none";
export const filterMeToken = "me";

export const issueSearchParameters = {
  states: "state",
  stateTypes: "status",
  assignees: "assignee",
  creators: "creator",
  priorities: "priority",
  labels: "label",
  projects: "project",
  search: "q",
  loadedIssues: "loaded",
  grouping: "group",
  ordering: "sort",
  layout: "layout",
  showCompleted: "completed",
  showEmptyGroups: "empty",
} as const;

export const issueFilterCategories = [
  { key: issueSearchParameters.states, menuLabel: "Status", chipLabel: "Status" },
  { key: issueSearchParameters.assignees, menuLabel: "Assignee", chipLabel: "Assignee" },
  { key: issueSearchParameters.creators, menuLabel: "Creator", chipLabel: "Creator" },
  { key: issueSearchParameters.priorities, menuLabel: "Priority", chipLabel: "Priority" },
  { key: issueSearchParameters.labels, menuLabel: "Labels", chipLabel: "Label" },
  { key: issueSearchParameters.projects, menuLabel: "Project", chipLabel: "Project" },
] as const;

export type IssueFilterCategory = (typeof issueFilterCategories)[number]["key"];

/** Parameters a "clear filters" action removes. */
export const issueFilterParameters = [
  ...issueFilterCategories.map((category) => category.key),
  issueSearchParameters.stateTypes,
  issueSearchParameters.search,
] as const;

/**
 * What a list is *about*, decided by the route rather than by the member
 * reading it. Deliberately a separate value from `IssueFilter` and never merged
 * with it: `listIssues` ANDs the two, so a filter can only narrow what the
 * route already decided. Values within one property still OR.
 *
 * A scope is stated in identifiers alone; `me` and `none` are the URL's
 * vocabulary and stay with the filter that carries them.
 */
export type IssueScope = {
  readonly stateTypes: readonly WorkflowStateType[];
  readonly assigneeIdentifiers: readonly string[];
  readonly creatorIdentifiers: readonly string[];
  readonly projectIdentifiers: readonly string[];
  /** When set, only these issues are in scope; an empty list is no issues. */
  readonly issueIdentifiers: readonly string[] | null;
  readonly parentIdentifier: string | null;
  readonly includeSubIssues: boolean;
};

/**
 * The filter categories a scope has already settled, which a page therefore
 * leaves out of its Filter menu: a scope naming exactly one assignee, creator
 * or project is ANDed with any other choice in that category, so every choice
 * but the one the page is about empties it. Naming several values is a real
 * narrowing, so only the settled categories are dropped.
 */
export const settledFilterCategories = (scope: IssueScope): readonly IssueFilterCategory[] => [
  ...(scope.assigneeIdentifiers.length === 1 ? [issueSearchParameters.assignees] : []),
  ...(scope.creatorIdentifiers.length === 1 ? [issueSearchParameters.creators] : []),
  ...(scope.projectIdentifiers.length === 1 ? [issueSearchParameters.projects] : []),
];

export const everyIssueScope: IssueScope = {
  stateTypes: [],
  assigneeIdentifiers: [],
  creatorIdentifiers: [],
  projectIdentifiers: [],
  issueIdentifiers: null,
  parentIdentifier: null,
  includeSubIssues: true,
};

/**
 * What the member reading a list asked to see, parsed from the URL. Arrays OR
 * within a property, properties AND, and the whole filter is then ANDed with
 * the route's `IssueScope`.
 */
export type IssueFilter = {
  readonly stateIdentifiers: readonly string[];
  readonly stateTypes: readonly WorkflowStateType[];
  readonly assigneeIdentifiers: readonly string[];
  readonly creatorIdentifiers: readonly string[];
  readonly priorities: readonly Priority[];
  readonly labelIdentifiers: readonly string[];
  readonly projectIdentifiers: readonly string[];
  readonly search: string;
};

/**
 * An `IssueFilter` with the tokens spent: `me` has become an identifier and
 * `none` a flag, so the identifier lists hold identifiers only.
 */
export type ResolvedIssueFilter = IssueFilter & {
  readonly includeUnassigned: boolean;
  readonly includeNoProject: boolean;
};

/** The only place the `me` and `none` tokens are interpreted. */
export const resolveIssueFilter = (
  filter: IssueFilter,
  currentUserIdentifier: string,
): ResolvedIssueFilter => {
  const substituteCurrentUser = (identifier: string): string =>
    identifier === filterMeToken ? currentUserIdentifier : identifier;
  const withoutNoneToken = (identifiers: readonly string[]): readonly string[] =>
    identifiers.filter((identifier) => identifier !== filterNoneToken);

  return {
    ...filter,
    assigneeIdentifiers: withoutNoneToken(filter.assigneeIdentifiers).map(substituteCurrentUser),
    creatorIdentifiers: filter.creatorIdentifiers.map(substituteCurrentUser),
    projectIdentifiers: withoutNoneToken(filter.projectIdentifiers),
    includeUnassigned: filter.assigneeIdentifiers.includes(filterNoneToken),
    includeNoProject: filter.projectIdentifiers.includes(filterNoneToken),
  };
};

export type IssueViewOptions = {
  readonly grouping: IssueGrouping;
  readonly ordering: IssueOrdering;
  readonly layout: IssueLayout;
  readonly showCompleted: boolean;
  readonly showEmptyGroups: boolean;
};

export const emptyIssueFilter: IssueFilter = {
  stateIdentifiers: [],
  stateTypes: [],
  assigneeIdentifiers: [],
  creatorIdentifiers: [],
  priorities: [],
  labelIdentifiers: [],
  projectIdentifiers: [],
  search: "",
};

export const defaultIssueViewOptions: IssueViewOptions = {
  grouping: "state",
  ordering: "priority",
  layout: "list",
  showCompleted: true,
  showEmptyGroups: false,
};

export type SearchParameters = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

const readList = (
  parameters: SearchParameters,
  key: string,
): readonly string[] => {
  const raw = parameters[key];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

const readSingle = (
  parameters: SearchParameters,
  key: string,
): string | undefined => {
  const raw = parameters[key];
  return typeof raw === "string" ? raw : raw?.[0];
};

const isWorkflowStateType = (value: string): value is WorkflowStateType =>
  workflowStateTypes.some((type) => type === value);

/**
 * Filter lists reach `inArray` against uuid columns, where a malformed value is
 * a database error rather than an empty result.
 */
const identifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const readIdentifierList = (
  parameters: SearchParameters,
  key: string,
  acceptedTokens: readonly string[] = [],
): readonly string[] =>
  readList(parameters, key).filter(
    (value) => identifierPattern.test(value) || acceptedTokens.includes(value),
  );

export const parseIssueFilter = (parameters: SearchParameters): IssueFilter => ({
  stateIdentifiers: readIdentifierList(parameters, issueSearchParameters.states),
  stateTypes: readList(parameters, issueSearchParameters.stateTypes).filter(isWorkflowStateType),
  // Both tokens mean something here: an issue can be assigned to you, or to nobody.
  assigneeIdentifiers: readIdentifierList(parameters, issueSearchParameters.assignees, [
    filterMeToken,
    filterNoneToken,
  ]),
  // Every issue has a creator, so only `me` is a meaningful token.
  creatorIdentifiers: readIdentifierList(parameters, issueSearchParameters.creators, [filterMeToken]),
  priorities: readList(parameters, issueSearchParameters.priorities)
    .map(Number)
    .filter((value): value is Priority => isPriority(value)),
  labelIdentifiers: readIdentifierList(parameters, issueSearchParameters.labels),
  // An issue belongs to at most one project, and to none is a choice.
  projectIdentifiers: readIdentifierList(parameters, issueSearchParameters.projects, [filterNoneToken]),
  search: readSingle(parameters, issueSearchParameters.search)?.trim() ?? "",
});

/** How many issues a list loads at once, and the step every "load more" adds. */
export const issuePageSize = 250;

/**
 * How many issues the URL asks for. "Load more" only ever grows it, so the list
 * stays the prefix of one order rather than separately fetched pages stitched
 * together.
 */
export const parseLoadedIssueCount = (parameters: SearchParameters): number => {
  const requested = Number(readSingle(parameters, issueSearchParameters.loadedIssues));
  return Number.isInteger(requested) && requested > issuePageSize ? requested : issuePageSize;
};

const isGrouping = (value: string | undefined): value is IssueGrouping =>
  issueGroupings.some((grouping) => grouping === value);

const isOrdering = (value: string | undefined): value is IssueOrdering =>
  issueOrderings.some((ordering) => ordering === value);

const isLayout = (value: string | undefined): value is IssueLayout =>
  issueLayouts.some((layout) => layout === value);

export const parseIssueViewOptions = (
  parameters: SearchParameters,
  defaults: IssueViewOptions = defaultIssueViewOptions,
): IssueViewOptions => {
  const grouping = readSingle(parameters, issueSearchParameters.grouping);
  const ordering = readSingle(parameters, issueSearchParameters.ordering);
  const layout = readSingle(parameters, issueSearchParameters.layout);
  const completed = readSingle(parameters, issueSearchParameters.showCompleted);
  const emptyGroups = readSingle(parameters, issueSearchParameters.showEmptyGroups);
  return {
    grouping: isGrouping(grouping) ? grouping : defaults.grouping,
    ordering: isOrdering(ordering) ? ordering : defaults.ordering,
    layout: isLayout(layout) ? layout : defaults.layout,
    showCompleted:
      completed === undefined ? defaults.showCompleted : completed !== "0",
    showEmptyGroups:
      emptyGroups === undefined ? defaults.showEmptyGroups : emptyGroups === "1",
  };
};


/** The inverse of `parseIssueViewOptions`: an option at its default is dropped. */
export const issueViewOptionsPatch = (
  options: Partial<IssueViewOptions>,
): Readonly<Record<string, string | null>> => {
  const encode = <Key extends keyof IssueViewOptions>(key: Key): string | null => {
    const value = options[key];
    if (value === undefined || value === defaultIssueViewOptions[key]) {
      return null;
    }
    return typeof value === "boolean" ? (value ? "1" : "0") : value;
  };
  return Object.fromEntries(
    (Object.keys(options) as (keyof IssueViewOptions)[]).map((key) => [issueSearchParameters[key], encode(key)]),
  );
};
