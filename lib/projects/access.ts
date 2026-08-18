import { and, eq, exists, inArray, isNull, not, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { cache } from "react";

import { getDiscordRoleIdentifiers } from "@/lib/discord/roles";
import { getDatabase, type Database } from "@/lib/database/client";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { issues, projectMembers, projectRoleAccess, projects } from "@/lib/database/schema";
import { findCurrentUser } from "@/lib/session/current-user";
import { identifierSchema } from "@/lib/validation/schemas";

/**
 * A project with role restrictions is visible to admins, its lead, its explicit
 * members and anyone holding one of the allowed roles; an unrestricted project
 * is visible to everyone.
 */
export type ProjectAccessContext = {
  readonly userIdentifier: string;
  readonly isAdmin: boolean;
  readonly roleIdentifiers: readonly string[];
};

const projectAccessContextOf = async (member: {
  readonly identifier: string;
  readonly isAdmin: boolean;
}): Promise<ProjectAccessContext> => ({
  userIdentifier: member.identifier,
  isAdmin: member.isAdmin,
  roleIdentifiers: member.isAdmin ? [] : await getDiscordRoleIdentifiers(member.identifier),
});

export const getProjectAccessContext = cache(async (): Promise<ProjectAccessContext | null> => {
  const user = await findCurrentUser();
  return user ? projectAccessContextOf(user) : null;
});

const restrictedProjectCondition = (database: Database): SQL =>
  exists(
    database
      .select({ one: sql`1` })
      .from(projectRoleAccess)
      .where(eq(projectRoleAccess.projectIdentifier, projects.identifier)),
  );

/** Condition on the `projects` table; undefined means no filtering is needed. */
export const accessibleProjectCondition = (
  database: Database,
  context: ProjectAccessContext | null,
): SQL | undefined => {
  if (context === null) {
    return sql`false`;
  }
  if (context.isAdmin) {
    return undefined;
  }
  return or(
    not(restrictedProjectCondition(database)),
    context.roleIdentifiers.length > 0
      ? exists(
          database
            .select({ one: sql`1` })
            .from(projectRoleAccess)
            .where(
              and(
                eq(projectRoleAccess.projectIdentifier, projects.identifier),
                inArray(projectRoleAccess.discordRoleIdentifier, [...context.roleIdentifiers]),
              ),
            ),
        )
      : undefined,
    eq(projects.leadIdentifier, context.userIdentifier),
    exists(
      database
        .select({ one: sql`1` })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectIdentifier, projects.identifier),
            eq(projectMembers.userIdentifier, context.userIdentifier),
          ),
        ),
    ),
  );
};

/**
 * Issues outside any project are always visible. The project column is a
 * parameter because the sub-issue counts scan `issues` a second time under
 * another name, and a count that ignores access leaks what the list hides.
 */
export const accessibleIssueCondition = (
  database: Database,
  context: ProjectAccessContext | null,
  issueProjectColumn: AnyPgColumn = issues.projectIdentifier,
): SQL | undefined => {
  const projectCondition = accessibleProjectCondition(database, context);
  if (projectCondition === undefined) {
    return undefined;
  }
  return or(
    isNull(issueProjectColumn),
    inArray(
      issueProjectColumn,
      database.select({ identifier: projects.identifier }).from(projects).where(projectCondition),
    ),
  );
};

const isProjectAccessible = async (
  database: Database,
  context: ProjectAccessContext | null,
  projectIdentifier: string,
): Promise<boolean> => {
  const row = await database.query.projects.findFirst({
    where: and(eq(projects.identifier, projectIdentifier), accessibleProjectCondition(database, context)),
    columns: { identifier: true },
  });
  return row !== undefined;
};

export const canAccessProject = async (projectIdentifier: string): Promise<boolean> => {
  const [database, context] = await Promise.all([getDatabase(), getProjectAccessContext()]);
  return isProjectAccessible(database, context, projectIdentifier);
};

/**
 * Resolved once for reads that carry other issues alongside the one they are
 * about — an issue's parent, its relations — which cannot express "and only
 * when it is visible" in the query, and drop afterwards what this excludes.
 */
export type VisibleProjects = {
  /** True for admins, who see every project without listing them. */
  readonly everyProject: boolean;
  readonly identifiers: ReadonlySet<string>;
};

export const loadVisibleProjects = async (
  database: Database,
  context: ProjectAccessContext | null,
): Promise<VisibleProjects> => {
  const projectCondition = accessibleProjectCondition(database, context);
  if (projectCondition === undefined) {
    return { everyProject: true, identifiers: new Set() };
  }
  const rows = await database
    .select({ identifier: projects.identifier })
    .from(projects)
    .where(projectCondition);
  return { everyProject: false, identifiers: new Set(rows.map((row) => row.identifier)) };
};

export const isIssueVisible = (
  visibleProjects: VisibleProjects,
  projectIdentifier: string | null,
): boolean =>
  projectIdentifier === null ||
  visibleProjects.everyProject ||
  visibleProjects.identifiers.has(projectIdentifier);

export const assertProjectAccessible = async (projectIdentifier: string | null): Promise<void> => {
  if (projectIdentifier !== null && !(await canAccessProject(projectIdentifier))) {
    throw new ForbiddenError("You do not have access to this project.");
  }
};

export const assertIssueAccessible = async (issueIdentifier: string): Promise<void> => {
  const database = await getDatabase();
  const issue = await database.query.issues.findFirst({
    where: eq(issues.identifier, issueIdentifier),
    columns: { projectIdentifier: true },
  });
  await assertProjectAccessible(issue?.projectIdentifier ?? null);
};

type OpenedRow<Row> = {
  readonly database: Database;
  readonly row: Row;
};

type RowAccess<Row> = {
  readonly load: (database: Database, identifier: string) => Promise<Row | undefined>;
  readonly notFoundMessage: string;
  /** Rejects unless the actor may change this row; called for its effect. */
  readonly assertAccessible: (row: Row) => Promise<unknown>;
};

/**
 * Comments, reminders, milestones and project updates all inherit the access
 * rules of the issue or project they hang off, and this is the one place that
 * sequence is written, so none of them can quietly skip a step.
 */
export const openAccessibleRow = async <Row>(
  rawIdentifier: string,
  access: RowAccess<Row>,
): Promise<OpenedRow<Row>> => {
  const identifier = identifierSchema.parse(rawIdentifier);
  const database = await getDatabase();
  const row = await access.load(database, identifier);
  if (!row) {
    throw new NotFoundError(access.notFoundMessage);
  }
  await access.assertAccessible(row);
  return { database, row };
};

export const canManageProjectAccess = (
  context: ProjectAccessContext | null,
  project: { readonly leadIdentifier: string | null },
): boolean =>
  context !== null && (context.isAdmin || project.leadIdentifier === context.userIdentifier);
