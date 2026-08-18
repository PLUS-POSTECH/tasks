"use server";

import { and, count, desc, eq, max } from "drizzle-orm";
import { z } from "zod";

import { getDatabase, type Database } from "@/lib/database/client";
import { manualOrderAfter } from "@/lib/database/manual-order";
import { ForbiddenError } from "@/lib/errors";
import {
  issues,
  projectHealths,
  projectMembers,
  projectMilestones,
  projectRoleAccess,
  projectStatuses,
  projectUpdates,
  projects,
} from "@/lib/database/schema";
import { recordMilestonesCleared } from "@/lib/issues/mutations";
import { action } from "@/lib/session/action";
import { revalidateEverything } from "@/lib/utilities/revalidate";
import {
  calendarDateSchema,
  discordSnowflakeSchema,
  hexColorSchema,
  identifierSchema,
  projectDescriptionSchema,
  projectIconSchema,
  projectNameSchema,
} from "@/lib/validation/schemas";
import { getWorkspace } from "@/lib/workspace/queries";

import {
  assertProjectAccessible,
  canManageProjectAccess,
  getProjectAccessContext,
  openAccessibleRow,
} from "./access";

const nullableCalendarDateSchema = calendarDateSchema.nullable();

const openProject = async (rawIdentifier: string): Promise<{ readonly database: Database; readonly projectIdentifier: string }> => {
  const projectIdentifier = identifierSchema.parse(rawIdentifier);
  await assertProjectAccessible(projectIdentifier);
  return { database: await getDatabase(), projectIdentifier };
};

/**
 * Everything that moves the access boundary — the roles, the member list, the
 * lead and deleting the project — must go through here, because each of them
 * is a way to hand a restricted project to somebody else.
 */
const assertCanManageProject = async (
  database: Database,
  projectIdentifier: string,
  refusal: string,
): Promise<void> => {
  const [context, project] = await Promise.all([
    getProjectAccessContext(),
    database.query.projects.findFirst({
      where: eq(projects.identifier, projectIdentifier),
      columns: { leadIdentifier: true },
    }),
  ]);
  if (!project || !canManageProjectAccess(context, project)) {
    throw new ForbiddenError(refusal);
  }
};

const openProjectChild = <Row extends { readonly projectIdentifier: string }>(
  rawIdentifier: string,
  load: (database: Database, identifier: string) => Promise<Row | undefined>,
) =>
  openAccessibleRow(rawIdentifier, {
    load,
    notFoundMessage: "Not found.",
    assertAccessible: (row) => assertProjectAccessible(row.projectIdentifier),
  });

const createProjectSchema = z.object({
  name: projectNameSchema,
  description: projectDescriptionSchema.nullable().default(null),
  icon: projectIconSchema.default("▣"),
  color: hexColorSchema.default("#5e6ad2"),
  status: z.enum(projectStatuses).default("backlog"),
  leadIdentifier: identifierSchema.nullable().default(null),
  startDate: nullableCalendarDateSchema.default(null),
  targetDate: nullableCalendarDateSchema.default(null),
});

export type CreateProjectInput = z.input<typeof createProjectSchema>;

export const createProject = action(async (actor, rawInput: CreateProjectInput): Promise<{ identifier: string }> => {
  const input = createProjectSchema.parse(rawInput);
  const [database, workspace] = await Promise.all([getDatabase(), getWorkspace()]);

  const created = await database.transaction(async (transaction) => {
    // Projects are listed in their manual order, so a new one goes last.
    const [highestInUse] = await transaction
      .select({ sortOrder: max(projects.sortOrder) })
      .from(projects)
      .where(eq(projects.workspaceIdentifier, workspace.identifier));
    const [project] = await transaction
      .insert(projects)
      .values({
        workspaceIdentifier: workspace.identifier,
        name: input.name,
        description: input.description,
        icon: input.icon,
        color: input.color,
        status: input.status,
        leadIdentifier: input.leadIdentifier,
        startDate: input.startDate,
        targetDate: input.targetDate,
        sortOrder: manualOrderAfter(highestInUse?.sortOrder ?? null),
      })
      .returning({ identifier: projects.identifier });
    if (!project) {
      throw new Error("Failed to create the project.");
    }
    await transaction.insert(projectMembers).values(
      [...new Set([actor.identifier, ...(input.leadIdentifier ? [input.leadIdentifier] : [])])].map(
        (userIdentifier) => ({ projectIdentifier: project.identifier, userIdentifier }),
      ),
    );
    return project;
  });
  revalidateEverything();
  return created;
});

/**
 * Health is deliberately absent: `addProjectUpdate` writes it in the same
 * transaction as the update explaining it, and a health set on its own
 * contradicts the newest entry in the project's own feed.
 */
const updateProjectSchema = z.object({
  name: projectNameSchema.optional(),
  description: projectDescriptionSchema.nullable().optional(),
  content: z.string().max(50_000).nullable().optional(),
  status: z.enum(projectStatuses).optional(),
  leadIdentifier: identifierSchema.nullable().optional(),
  startDate: nullableCalendarDateSchema.optional(),
  targetDate: nullableCalendarDateSchema.optional(),
});

export type UpdateProjectInput = z.input<typeof updateProjectSchema>;

export const updateProject = action(async (_actor, rawIdentifier: string, rawPatch: UpdateProjectInput): Promise<void> => {
  const patch = updateProjectSchema.parse(rawPatch);
  const { database, projectIdentifier } = await openProject(rawIdentifier);
  // `canManageProjectAccess` is exactly "admin or lead", so anyone who could
  // set the lead could make themselves lead and rewrite who may see the project.
  if (patch.leadIdentifier !== undefined) {
    await assertCanManageProject(
      database,
      projectIdentifier,
      "Only admins and the project lead can change the project lead.",
    );
  }
  await database
    .update(projects)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(projects.identifier, projectIdentifier));
  revalidateEverything();
});

export const toggleProjectMember = action(async (_actor, rawIdentifier: string, userIdentifier: string): Promise<void> => {
  const parsedUser = identifierSchema.parse(userIdentifier);
  const { database, projectIdentifier } = await openProject(rawIdentifier);
  await assertCanManageProject(
    database,
    projectIdentifier,
    "Only admins and the project lead can change who is on a project.",
  );
  const membership = and(eq(projectMembers.projectIdentifier, projectIdentifier), eq(projectMembers.userIdentifier, parsedUser));
  const existing = await database.query.projectMembers.findFirst({ where: membership });
  if (existing) {
    await database.delete(projectMembers).where(membership);
  } else {
    await database.insert(projectMembers).values({ projectIdentifier, userIdentifier: parsedUser });
  }
  revalidateEverything();
});

/**
 * Refuses while any issue still points at the project: `issues.project_identifier`
 * is `on delete set null` and an issue in no project is visible to everyone, so
 * deleting one would publish a restricted project's issues.
 */
export const deleteProject = action(async (actor, rawIdentifier: string): Promise<void> => {
  const { database, projectIdentifier } = await openProject(rawIdentifier);
  await assertCanManageProject(
    database,
    projectIdentifier,
    "Only admins and the project lead can delete a project.",
  );
  const [remaining] = await database
    .select({ issueCount: count() })
    .from(issues)
    .where(eq(issues.projectIdentifier, projectIdentifier));
  const issueCount = remaining?.issueCount ?? 0;
  if (issueCount > 0) {
    throw new Error(
      `This project still has ${issueCount} ${issueCount === 1 ? "issue" : "issues"}. Move them to another project, or delete them, before deleting the project.`,
    );
  }
  await database.transaction(async (transaction) => {
    // `on delete set null` silently takes these milestones off any issue still
    // pinned across projects, so the activity is recorded before they go.
    const milestones = await transaction
      .select({ identifier: projectMilestones.identifier })
      .from(projectMilestones)
      .where(eq(projectMilestones.projectIdentifier, projectIdentifier));
    await recordMilestonesCleared(transaction, actor.identifier, milestones.map((milestone) => milestone.identifier));
    await transaction.delete(projects).where(eq(projects.identifier, projectIdentifier));
  });
  revalidateEverything();
});

export const addProjectUpdate = action(async (actor, rawIdentifier: string, health: string, body: string): Promise<void> => {
  const parsedHealth = z.enum(projectHealths).parse(health);
  const parsedBody = z.string().trim().min(1).max(20_000).parse(body);
  const { database, projectIdentifier } = await openProject(rawIdentifier);
  await database.transaction(async (transaction) => {
    await transaction.insert(projectUpdates).values({
      projectIdentifier,
      authorIdentifier: actor.identifier,
      health: parsedHealth,
      body: parsedBody,
    });
    await transaction
      .update(projects)
      .set({ health: parsedHealth, updatedAt: new Date() })
      .where(eq(projects.identifier, projectIdentifier));
  });
  revalidateEverything();
});

/**
 * `projects.health` is only ever written alongside an update, so deleting one
 * has to reset the badge from the newest update that survives.
 */
export const deleteProjectUpdate = action(async (actor, updateIdentifier: string): Promise<void> => {
  const { database, row } = await openProjectChild(updateIdentifier, (db, identifier) =>
    db.query.projectUpdates.findFirst({
      where: eq(projectUpdates.identifier, identifier),
      columns: { identifier: true, projectIdentifier: true, authorIdentifier: true },
    }),
  );
  if (row.authorIdentifier !== actor.identifier && !actor.isAdmin) {
    throw new ForbiddenError("Only the author or an admin can delete a project update.");
  }
  await database.transaction(async (transaction) => {
    await transaction.delete(projectUpdates).where(eq(projectUpdates.identifier, row.identifier));
    const newest = await transaction.query.projectUpdates.findFirst({
      where: eq(projectUpdates.projectIdentifier, row.projectIdentifier),
      orderBy: [desc(projectUpdates.createdAt)],
      columns: { health: true },
    });
    await transaction
      .update(projects)
      .set({ health: newest?.health ?? null, updatedAt: new Date() })
      .where(eq(projects.identifier, row.projectIdentifier));
  });
  revalidateEverything();
});

const milestoneSchema = z.object({
  name: projectNameSchema,
  targetDate: nullableCalendarDateSchema.default(null),
});

export type MilestoneInput = z.input<typeof milestoneSchema>;

/**
 * The project row is held `for update` so the read of the last position and the
 * insert are one step: two concurrent adds would otherwise be given the same
 * position, and a milestone has no drag to separate a tied pair again.
 */
export const createMilestone = action(async (_actor, rawIdentifier: string, rawInput: MilestoneInput): Promise<void> => {
  const input = milestoneSchema.parse(rawInput);
  const { database, projectIdentifier } = await openProject(rawIdentifier);
  await database.transaction(async (transaction) => {
    await transaction
      .select({ identifier: projects.identifier })
      .from(projects)
      .where(eq(projects.identifier, projectIdentifier))
      .for("update");
    const [highestInUse] = await transaction
      .select({ sortOrder: max(projectMilestones.sortOrder) })
      .from(projectMilestones)
      .where(eq(projectMilestones.projectIdentifier, projectIdentifier));
    await transaction
      .insert(projectMilestones)
      .values({ projectIdentifier, ...input, sortOrder: manualOrderAfter(highestInUse?.sortOrder ?? null) });
  });
  revalidateEverything();
});

const loadMilestone = (database: Database, identifier: string) =>
  database.query.projectMilestones.findFirst({
    where: eq(projectMilestones.identifier, identifier),
    columns: { identifier: true, projectIdentifier: true },
  });

export const updateMilestone = action(async (_actor, milestoneIdentifier: string, rawInput: MilestoneInput): Promise<void> => {
  const input = milestoneSchema.parse(rawInput);
  const { database, row } = await openProjectChild(milestoneIdentifier, loadMilestone);
  await database
    .update(projectMilestones)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(projectMilestones.identifier, row.identifier));
  revalidateEverything();
});

export const deleteMilestone = action(async (actor, milestoneIdentifier: string): Promise<void> => {
  const { database, row } = await openProjectChild(milestoneIdentifier, loadMilestone);
  await database.transaction(async (transaction) => {
    await recordMilestonesCleared(transaction, actor.identifier, [row.identifier]);
    await transaction.delete(projectMilestones).where(eq(projectMilestones.identifier, row.identifier));
  });
  revalidateEverything();
});

const accessRolesSchema = z
  .array(z.object({ identifier: discordSnowflakeSchema, name: z.string().trim().min(1).max(100) }))
  .max(100);

export type ProjectAccessRoleInput = z.input<typeof accessRolesSchema>[number];

/** An empty list opens the project to every member. */
export const setProjectAccessRoles = action(async (_actor, rawIdentifier: string, rawRoles: readonly ProjectAccessRoleInput[]): Promise<void> => {
  const roles = accessRolesSchema.parse(rawRoles);
  const { database, projectIdentifier } = await openProject(rawIdentifier);
  await assertCanManageProject(
    database,
    projectIdentifier,
    "Only admins and the project lead can change project access.",
  );
  await database.transaction(async (transaction) => {
    await transaction.delete(projectRoleAccess).where(eq(projectRoleAccess.projectIdentifier, projectIdentifier));
    if (roles.length > 0) {
      await transaction.insert(projectRoleAccess).values(
        roles.map((role) => ({ projectIdentifier, discordRoleIdentifier: role.identifier, discordRoleName: role.name })),
      );
    }
  });
  revalidateEverything();
});
