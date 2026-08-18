import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { cache } from "react";

import { getDatabase, type Database } from "@/lib/database/client";
import {
  projectMilestones,
  projectUpdates,
  projects,
  type ProjectHealth,
  type ProjectStatus,
  type WorkflowStateType,
} from "@/lib/database/schema";
import type { UserSummary } from "@/lib/users/types";

import type { ProjectSummary } from "./types";
import { toOptionalUserSummary, toUserSummary, userSummaryColumns } from "@/lib/users/summary";

import {
  accessibleProjectCondition,
  canManageProjectAccess,
  getProjectAccessContext,
  type ProjectAccessContext,
} from "./access";

export type ProjectProgress = {
  readonly total: number;
  readonly completed: number;
  readonly started: number;
  readonly canceled: number;
};

export type ProjectListItem = {
  readonly identifier: string;
  readonly name: string;
  readonly description: string | null;
  readonly icon: string;
  readonly color: string;
  readonly status: ProjectStatus;
  readonly health: ProjectHealth | null;
  readonly lead: UserSummary | null;
  readonly startDate: string | null;
  readonly targetDate: string | null;
  readonly progress: ProjectProgress;
  readonly updatedAt: Date;
  readonly sortOrder: number;
  /** True when access is limited to specific Discord roles. */
  readonly restricted: boolean;
  /** Whether the current member may change who reaches the project, and delete it. */
  readonly canManageAccess: boolean;
};

export type ProjectAccessRole = {
  readonly identifier: string;
  readonly name: string;
};

export type ProjectMilestone = {
  readonly identifier: string;
  readonly name: string;
  readonly targetDate: string | null;
  readonly sortOrder: number;
  readonly progress: ProjectProgress;
};

export type MilestoneName = {
  readonly identifier: string;
  readonly name: string;
};

export type ProjectUpdate = {
  readonly identifier: string;
  readonly health: ProjectHealth;
  readonly body: string;
  readonly author: UserSummary | null;
  readonly createdAt: Date;
};

export type ProjectDetail = ProjectListItem & {
  readonly content: string | null;
  readonly members: readonly UserSummary[];
  readonly milestones: readonly ProjectMilestone[];
  readonly updates: readonly ProjectUpdate[];
  /** Discord roles allowed in; empty means everyone. */
  readonly accessRoles: readonly ProjectAccessRole[];
};


/**
 * Manual order first, then the keys that settle a tie: `sort_order` is unique
 * only by convention and there is no milestone drag to separate two that end up
 * sharing one, so an edit to either must not be able to swap them on the page.
 */
export const milestoneDisplayOrder = [
  asc(projectMilestones.sortOrder),
  asc(projectMilestones.createdAt),
  asc(projectMilestones.identifier),
] as const;

const projectListWith = {
  lead: { columns: userSummaryColumns },
  roleAccess: { columns: { discordRoleIdentifier: true, discordRoleName: true } },
} as const;

/** The state types a project counts separately; the rest only add to the total. */
type ProjectProgressStateType = Extract<WorkflowStateType, "completed" | "started" | "canceled">;

/**
 * Counted in the database rather than by loading every issue of every project.
 * The inner references are written out because a relational query renames the
 * table it is built on.
 */
const projectIssuesOfType = (stateType: ProjectProgressStateType): SQL<number> =>
  sql<number>`(
    select count(*) from "issues"
    join "workflow_states" on "workflow_states"."identifier" = "issues"."state_identifier"
    where "issues"."project_identifier" = ${projects.identifier}
      and "workflow_states"."type" = ${stateType}
  )`;

const projectProgressCounts = {
  issueCount: sql<number>`(
    select count(*) from "issues" where "issues"."project_identifier" = ${projects.identifier}
  )`
    .mapWith(Number)
    .as("issue_count"),
  completedIssueCount: projectIssuesOfType("completed").mapWith(Number).as("completed_issue_count"),
  startedIssueCount: projectIssuesOfType("started").mapWith(Number).as("started_issue_count"),
  canceledIssueCount: projectIssuesOfType("canceled").mapWith(Number).as("canceled_issue_count"),
} as const;

/** Milestone progress, counted over the issue rows the detail page already holds. */
const progressOf = (
  issues: readonly { readonly state: { readonly type: WorkflowStateType } }[],
): ProjectProgress => ({
  total: issues.length,
  completed: issues.filter((issue) => issue.state.type === "completed").length,
  started: issues.filter((issue) => issue.state.type === "started").length,
  canceled: issues.filter((issue) => issue.state.type === "canceled").length,
});

const queryProjectRows = (database: Database, where: SQL | undefined) =>
  database.query.projects.findMany({
    where,
    orderBy: [asc(projects.sortOrder), asc(projects.name)],
    with: projectListWith,
    extras: projectProgressCounts,
  });

type ProjectRow = Awaited<ReturnType<typeof queryProjectRows>>[number];

const toProjectListItem = (row: ProjectRow, context: ProjectAccessContext | null): ProjectListItem => ({
  identifier: row.identifier,
  name: row.name,
  description: row.description,
  icon: row.icon,
  color: row.color,
  status: row.status,
  health: row.health,
  lead: toOptionalUserSummary(row.lead),
  startDate: row.startDate,
  targetDate: row.targetDate,
  progress: {
    total: row.issueCount,
    completed: row.completedIssueCount,
    started: row.startedIssueCount,
    canceled: row.canceledIssueCount,
  },
  updatedAt: row.updatedAt,
  sortOrder: row.sortOrder,
  restricted: row.roleAccess.length > 0,
  canManageAccess: canManageProjectAccess(context, row),
});

export const listProjectSummaries = cache(
  async (): Promise<readonly ProjectSummary[]> => {
    const [database, context] = await Promise.all([getDatabase(), getProjectAccessContext()]);
    return database.query.projects.findMany({
      where: accessibleProjectCondition(database, context),
      orderBy: [asc(projects.sortOrder), asc(projects.name)],
      columns: { identifier: true, name: true, icon: true, color: true, status: true },
    });
  },
);

/**
 * Deliberately not filtered by project access, unlike every read that shows a
 * milestone as a property of something: the activity entry already carries the
 * name the milestone had, so this only decides whether the reader is shown the
 * current words or the recorded ones.
 */
export const listMilestoneNames = cache(
  async (): Promise<readonly MilestoneName[]> => {
    const database = await getDatabase();
    return database.query.projectMilestones.findMany({ columns: { identifier: true, name: true } });
  },
);

export const listProjects = cache(
  async (): Promise<readonly ProjectListItem[]> => {
    const [database, context] = await Promise.all([getDatabase(), getProjectAccessContext()]);
    const rows = await queryProjectRows(database, accessibleProjectCondition(database, context));
    return rows.map((row) => toProjectListItem(row, context));
  },
);

export const getProjectDetail = cache(
  async (identifier: string): Promise<ProjectDetail | null> => {
    const [database, context] = await Promise.all([getDatabase(), getProjectAccessContext()]);
    const row = await database.query.projects.findFirst({
      where: and(eq(projects.identifier, identifier), accessibleProjectCondition(database, context)),
      with: {
        ...projectListWith,
        // Progress per milestone needs the issue rows themselves, not the
        // counts on the project.
        issues: {
          columns: { identifier: true, milestoneIdentifier: true },
          with: { state: { columns: { type: true } } },
        },
        members: { with: { user: { columns: userSummaryColumns } } },
        milestones: { orderBy: [...milestoneDisplayOrder] },
        updates: {
          orderBy: [desc(projectUpdates.createdAt)],
          with: { author: { columns: userSummaryColumns } },
        },
      },
      extras: projectProgressCounts,
    });
    if (!row) {
      return null;
    }
    return {
      ...toProjectListItem(row, context),
      content: row.content,
      accessRoles: row.roleAccess.map((access) => ({
        identifier: access.discordRoleIdentifier,
        name: access.discordRoleName,
      })),
      members: row.members.map((member) => toUserSummary(member.user)),
      milestones: row.milestones.map((milestone) => ({
        identifier: milestone.identifier,
        name: milestone.name,
        targetDate: milestone.targetDate,
        sortOrder: milestone.sortOrder,
        progress: progressOf(
          row.issues.filter((issue) => issue.milestoneIdentifier === milestone.identifier),
        ),
      })),
      updates: row.updates.map((update) => ({
        identifier: update.identifier,
        health: update.health,
        body: update.body,
        author: toOptionalUserSummary(update.author),
        createdAt: update.createdAt,
      })),
    };
  },
);
