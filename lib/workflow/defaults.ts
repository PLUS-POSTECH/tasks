import { asc, eq } from "drizzle-orm";

import type { Database } from "@/lib/database/client";
import { workflowStates } from "@/lib/database/schema";
import type { WorkflowStateType } from "@/lib/database/schema/enum-values";

/**
 * Created with the workspace row rather than being sample data:
 * `issues.state_identifier` is NOT NULL, so a workspace with no states cannot
 * take its first issue.
 */
export const defaultWorkflowStates: readonly {
  readonly name: string;
  readonly type: WorkflowStateType;
  readonly color: string;
  readonly position: number;
}[] = [
  { name: "Backlog", type: "backlog", color: "#8a8f98", position: 1 },
  { name: "Todo", type: "unstarted", color: "#e2e2e2", position: 2 },
  { name: "In Progress", type: "started", color: "#f2c94c", position: 3 },
  { name: "In Review", type: "started", color: "#26b5ce", position: 4 },
  { name: "Done", type: "completed", color: "#5e6ad2", position: 5 },
  { name: "Canceled", type: "canceled", color: "#95a2b3", position: 6 },
  { name: "Duplicate", type: "canceled", color: "#95a2b3", position: 7 },
];

/**
 * Requests arriving at a fresh deployment together all find no states and all
 * insert. State names are unique per workspace, so only the first insert lands
 * and the losers read again to get what the winner created.
 */
export const ensureWorkflowStates = async (
  database: Database,
  workspaceIdentifier: string,
): Promise<ReadonlyMap<string, string>> => {
  const readStates = () =>
    database.query.workflowStates.findMany({
      where: eq(workflowStates.workspaceIdentifier, workspaceIdentifier),
      orderBy: [asc(workflowStates.position)],
      columns: { identifier: true, name: true },
    });
  const existing = await readStates();
  if (existing.length > 0) {
    return new Map(existing.map((state) => [state.name, state.identifier]));
  }
  await database
    .insert(workflowStates)
    .values(defaultWorkflowStates.map((state) => ({ ...state, workspaceIdentifier })))
    .onConflictDoNothing();
  const created = await readStates();
  if (created.length === 0) {
    throw new Error("The default workflow states could not be created; the workspace has no workflow.");
  }
  return new Map(created.map((state) => [state.name, state.identifier]));
};
