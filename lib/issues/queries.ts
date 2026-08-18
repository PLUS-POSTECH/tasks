import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cache } from "react";

import { getDatabase, type Database } from "@/lib/database/client";
import {
  issueAssignees,
  issueLabels,
  issueRelations,
  issueSubscriptions,
  issues,
  workflowStates,
  type WorkflowStateType,
} from "@/lib/database/schema";
import {
  accessibleIssueCondition,
  getProjectAccessContext,
  isIssueVisible,
  loadVisibleProjects,
  type ProjectAccessContext,
  type VisibleProjects,
} from "@/lib/projects/access";

import type { IssueScope, ResolvedIssueFilter } from "./filters";
import { formatIssueReference, parseIssueReference } from "./reference";
import type { IssueListItem } from "./types";
import { toOptionalUserSummary, toUserSummary, userSummaryColumns } from "@/lib/users/summary";
import { issueStateSummaryColumns } from "@/lib/workflow/queries";

export const issueListWith = {
  state: { columns: issueStateSummaryColumns },
  issueAssignees: { with: { user: { columns: userSummaryColumns } } },
  creator: { columns: userSummaryColumns },
  project: {
    columns: {
      identifier: true,
      name: true,
      icon: true,
      color: true,
      status: true,
    },
  },
  parent: {
    // The project is loaded to decide whether this row may mention its parent
    // at all; a relational query cannot put a condition on a `one` relation.
    columns: { identifier: true, number: true, title: true, projectIdentifier: true },
  },
  issueLabels: {
    with: {
      label: {
        columns: {
          identifier: true,
          name: true,
          color: true,
        },
      },
    },
  },
} as const;

const childIssues = alias(issues, "child");
const childIssueStates = alias(workflowStates, "child_state");

const blockingIssues = alias(issues, "blocker");

/**
 * The four numbers a row shows, counted in the database. The inner references
 * are written out because a relational query renames the table it is built on.
 *
 * The counts carry the same access predicate as the lists they label, so a
 * badge cannot tell a member that issues they may not see exist, or how many.
 */
export const issueListCounts = (database: Database, context: ProjectAccessContext | null) => {
  const visibleChild = accessibleIssueCondition(database, context, childIssues.projectIdentifier);
  const visibleBlocker = accessibleIssueCondition(database, context, blockingIssues.projectIdentifier);
  return {
    subIssueCount: sql<number>`(${database
      .select({ children: count() })
      .from(childIssues)
      .where(and(eq(childIssues.parentIdentifier, issues.identifier), visibleChild))})`
      .mapWith(Number)
      .as("sub_issue_count"),
    completedSubIssueCount: sql<number>`(${database
      .select({ children: count() })
      .from(childIssues)
      .innerJoin(childIssueStates, eq(childIssueStates.identifier, childIssues.stateIdentifier))
      .where(
        and(
          eq(childIssues.parentIdentifier, issues.identifier),
          eq(childIssueStates.type, "completed"),
          visibleChild,
        ),
      )})`
      .mapWith(Number)
      .as("completed_sub_issue_count"),
    commentCount: sql<number>`(select count(*) from "comments" where "comments"."issue_identifier" = ${issues.identifier} and "comments"."deleted_at" is null)`
      .mapWith(Number)
      .as("comment_count"),
    // The blocker is the issue at the other end, which is a different column in
    // each of the two directions a block can be written in — and it is the one
    // the access predicate applies to.
    blockedCount: sql<number>`(${database
      .select({ blockers: count() })
      .from(issueRelations)
      .innerJoin(
        blockingIssues,
        or(
          and(
            eq(issueRelations.type, "blocks"),
            eq(blockingIssues.identifier, issueRelations.issueIdentifier),
          ),
          and(
            eq(issueRelations.type, "blocked_by"),
            eq(blockingIssues.identifier, issueRelations.relatedIssueIdentifier),
          ),
        ),
      )
      .where(
        and(
          or(
            and(
              eq(issueRelations.relatedIssueIdentifier, issues.identifier),
              eq(issueRelations.type, "blocks"),
            ),
            and(
              eq(issueRelations.issueIdentifier, issues.identifier),
              eq(issueRelations.type, "blocked_by"),
            ),
          ),
          visibleBlocker,
        ),
      )})`
      .mapWith(Number)
      .as("blocked_count"),
  } as const;
};

/**
 * The issue columns a list row shows. `description` is deliberately not one of
 * them: it runs to 50,000 characters and no list renders it.
 */
const issueListColumns = {
  identifier: true,
  number: true,
  title: true,
  priority: true,
  estimate: true,
  dueDate: true,
  sortOrder: true,
  boardOrder: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
} as const;

type IssueRowQueryOptions = {
  readonly where: SQL | undefined;
  readonly orderBy?: readonly SQL[];
  readonly limit?: number;
};

/**
 * The two halves of issue access: a context for the conditions a query carries,
 * and the visible projects for rows that come back describing *other* issues —
 * a parent, a relation — which no condition on the queried table can reach.
 */
export type IssueReadAccess = {
  readonly context: ProjectAccessContext | null;
  readonly visibleProjects: VisibleProjects;
};

export const issueReadAccess = async (database: Database): Promise<IssueReadAccess> => {
  const context = await getProjectAccessContext();
  return { context, visibleProjects: await loadVisibleProjects(database, context) };
};

/** Restricts a condition to the issues the actor may see. */
export const accessibleIssues = (
  database: Database,
  where: SQL | undefined,
  access: IssueReadAccess,
): SQL | undefined => and(where, accessibleIssueCondition(database, access.context));

/** Every issue read goes through here so project access applies uniformly. */
const queryIssueRows = async (
  database: Database,
  options: IssueRowQueryOptions,
  access: IssueReadAccess,
) =>
  database.query.issues.findMany({
    where: accessibleIssues(database, options.where, access),
    columns: issueListColumns,
    with: issueListWith,
    extras: issueListCounts(database, access.context),
    ...(options.orderBy ? { orderBy: [...options.orderBy] } : {}),
    ...(options.limit ? { limit: options.limit } : {}),
  });

type IssueListRow = Awaited<ReturnType<typeof queryIssueRows>>[number];

export const toIssueListItem = (row: IssueListRow, visibleProjects: VisibleProjects): IssueListItem => {
  const assignees = row.issueAssignees
    .map((assignment) => toUserSummary(assignment.user))
    .sort((left, right) => left.name.localeCompare(right.name));
  return {
    identifier: row.identifier,
    number: row.number,
    reference: formatIssueReference(row.number),
    title: row.title,
    priority: row.priority,
    estimate: row.estimate,
    dueDate: row.dueDate,
    sortOrder: row.sortOrder,
    boardOrder: row.boardOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    state: row.state,
    assignees,
    // Singular compatibility for existing API clients; new callers use `assignees`.
    assignee: assignees[0] ?? null,
    creator: toOptionalUserSummary(row.creator),
    labels: row.issueLabels.map((issueLabel) => issueLabel.label),
    project: row.project,
    // Access control: a parent in a project the actor cannot see is not named.
    parent:
      row.parent && isIssueVisible(visibleProjects, row.parent.projectIdentifier)
        ? {
            identifier: row.parent.identifier,
            reference: formatIssueReference(row.parent.number),
            title: row.parent.title,
          }
        : null,
    subIssueCount: row.subIssueCount,
    completedSubIssueCount: row.completedSubIssueCount,
    isBlocked: row.blockedCount > 0,
    commentCount: row.commentCount,
  };
};

const assignedToAny = (database: Database, assigneeIdentifiers: readonly string[]): SQL =>
  exists(
    database
      .select({ issueIdentifier: issueAssignees.issueIdentifier })
      .from(issueAssignees)
      .where(
        and(
          eq(issueAssignees.issueIdentifier, issues.identifier),
          inArray(issueAssignees.userIdentifier, [...assigneeIdentifiers]),
        ),
      ),
  );

const hasNoAssignees = (database: Database): SQL =>
  notExists(
    database
      .select({ issueIdentifier: issueAssignees.issueIdentifier })
      .from(issueAssignees)
      .where(eq(issueAssignees.issueIdentifier, issues.identifier)),
  );

const inStateOfType = (
  database: Database,
  stateTypes: readonly WorkflowStateType[],
): SQL =>
  inArray(
    issues.stateIdentifier,
    database
      .select({ identifier: workflowStates.identifier })
      .from(workflowStates)
      .where(inArray(workflowStates.type, stateTypes)),
  );

const issueScopeConditions = (database: Database, scope: IssueScope): SQL | undefined => {
  const conditions: (SQL | undefined)[] = [];

  if (scope.stateTypes.length > 0) {
    conditions.push(inStateOfType(database, scope.stateTypes));
  }
  if (scope.assigneeIdentifiers.length > 0) {
    conditions.push(assignedToAny(database, scope.assigneeIdentifiers));
  }
  if (scope.creatorIdentifiers.length > 0) {
    conditions.push(inArray(issues.creatorIdentifier, scope.creatorIdentifiers));
  }
  if (scope.projectIdentifiers.length > 0) {
    conditions.push(inArray(issues.projectIdentifier, scope.projectIdentifiers));
  }
  if (scope.issueIdentifiers !== null) {
    conditions.push(
      scope.issueIdentifiers.length > 0
        ? inArray(issues.identifier, [...scope.issueIdentifiers])
        : sql`false`,
    );
  }
  // A parent scope already excludes top-level issues, settling `includeSubIssues`.
  if (scope.parentIdentifier) {
    conditions.push(eq(issues.parentIdentifier, scope.parentIdentifier));
  } else if (!scope.includeSubIssues) {
    conditions.push(isNull(issues.parentIdentifier));
  }

  return and(...conditions);
};

const issueFilterConditions = (
  database: Database,
  filter: ResolvedIssueFilter,
): SQL | undefined => {
  const conditions: (SQL | undefined)[] = [];

  if (filter.stateIdentifiers.length > 0) {
    conditions.push(inArray(issues.stateIdentifier, filter.stateIdentifiers));
  }
  if (filter.stateTypes.length > 0) {
    conditions.push(inStateOfType(database, filter.stateTypes));
  }
  if (filter.assigneeIdentifiers.length > 0 || filter.includeUnassigned) {
    conditions.push(
      or(
        filter.assigneeIdentifiers.length > 0
          ? assignedToAny(database, filter.assigneeIdentifiers)
          : undefined,
        filter.includeUnassigned ? hasNoAssignees(database) : undefined,
      ),
    );
  }
  if (filter.creatorIdentifiers.length > 0) {
    conditions.push(inArray(issues.creatorIdentifier, filter.creatorIdentifiers));
  }
  if (filter.priorities.length > 0) {
    conditions.push(inArray(issues.priority, [...filter.priorities]));
  }
  if (filter.labelIdentifiers.length > 0) {
    conditions.push(
      exists(
        database
          .select({ issueIdentifier: issueLabels.issueIdentifier })
          .from(issueLabels)
          .where(
            and(
              eq(issueLabels.issueIdentifier, issues.identifier),
              inArray(issueLabels.labelIdentifier, filter.labelIdentifiers),
            ),
          ),
      ),
    );
  }
  if (filter.projectIdentifiers.length > 0 || filter.includeNoProject) {
    conditions.push(
      or(
        filter.projectIdentifiers.length > 0
          ? inArray(issues.projectIdentifier, filter.projectIdentifiers)
          : undefined,
        filter.includeNoProject ? isNull(issues.projectIdentifier) : undefined,
      ),
    );
  }
  if (filter.search) {
    const issueNumber = parseIssueReference(filter.search);
    const pattern = `%${filter.search}%`;
    conditions.push(
      or(
        ilike(issues.title, pattern),
        ilike(issues.description, pattern),
        issueNumber === null ? undefined : eq(issues.number, issueNumber),
      ),
    );
  }

  return and(...conditions);
};

/**
 * The issues a route's scope and a member's filter agree on: both have to be
 * satisfied, while the values inside one property still mean "any of these".
 *
 * The order ends on the issue number so that a page boundary falls in the same
 * place every time: `sortOrder` is unique only by convention, and PostgreSQL
 * may return tied rows in one order for a small `LIMIT` and another for a
 * large one, losing and repeating issues across the boundary.
 */
export const listIssues = cache(
  async (
    scope: IssueScope,
    filter: ResolvedIssueFilter,
    limit?: number,
  ): Promise<readonly IssueListItem[]> => {
    const database = await getDatabase();
    const access = await issueReadAccess(database);
    const rows = await queryIssueRows(
      database,
      {
        where: and(
          issueScopeConditions(database, scope),
          issueFilterConditions(database, filter),
        ),
        orderBy: [asc(issues.sortOrder), desc(issues.createdAt), asc(issues.number)],
        limit,
      },
      access,
    );
    return rows.map((row) => toIssueListItem(row, access.visibleProjects));
  },
);

export type IssuePage = {
  readonly issues: readonly IssueListItem[];
  readonly hasMore: boolean;
};

export const listIssuePage = cache(
  async (
    scope: IssueScope,
    filter: ResolvedIssueFilter,
    limit: number,
  ): Promise<IssuePage> => {
    const rows = await listIssues(scope, filter, limit + 1);
    return { issues: rows.slice(0, limit), hasMore: rows.length > limit };
  },
);

export const listSubscribedIssueIdentifiers = cache(
  async (userIdentifier: string): Promise<readonly string[]> => {
    const database = await getDatabase();
    const rows = await database.query.issueSubscriptions.findMany({
      where: eq(issueSubscriptions.userIdentifier, userIdentifier),
      columns: { issueIdentifier: true },
    });
    return rows.map((row) => row.issueIdentifier);
  },
);

export const findIssueByReference = cache(
  async (reference: string): Promise<IssueListItem | null> => {
    const issueNumber = parseIssueReference(reference);
    if (issueNumber === null) {
      return null;
    }
    const database = await getDatabase();
    const access = await issueReadAccess(database);
    const [row] = await queryIssueRows(database, { where: eq(issues.number, issueNumber), limit: 1 }, access);
    return row ? toIssueListItem(row, access.visibleProjects) : null;
  },
);

