import { asc } from "drizzle-orm";
import { cache } from "react";

import { getDatabase } from "@/lib/database/client";
import { workspaces } from "@/lib/database/schema";
import { ensureWorkflowStates } from "@/lib/workflow/defaults";

import { defaultWorkspaceName, defaultWorkspaceSlug } from "./defaults";

export type WorkspaceRow = typeof workspaces.$inferSelect;

/**
 * The single workspace this deployment serves. A fresh deployment has no row
 * yet, so the first read creates a placeholder one.
 */
export const loadWorkspaceRow = async (): Promise<WorkspaceRow> => {
  const database = await getDatabase();
  const existing = await database.query.workspaces.findFirst({ orderBy: [asc(workspaces.createdAt)] });
  if (existing) {
    return existing;
  }
  console.info("[workspace] No workspace found; creating the default one. Open /setup to configure sign-in.");
  // The slug is unique, so a second instance racing here inserts nothing.
  await database
    .insert(workspaces)
    .values({ name: defaultWorkspaceName, slug: defaultWorkspaceSlug })
    .onConflictDoNothing();
  const created = await database.query.workspaces.findFirst({ orderBy: [asc(workspaces.createdAt)] });
  if (!created) {
    throw new Error("Could not create the workspace row.");
  }
  // Issues cannot exist without a state, so the workflow comes with the row.
  await ensureWorkflowStates(database, created.identifier);
  return created;
};

/**
 * One read of the row shared by every projection of it in a request. A caller
 * that has just written to it wants what it wrote, not what the request read
 * before, so writers keep using `loadWorkspaceRow`.
 */
export const getWorkspaceRow = cache(loadWorkspaceRow);
