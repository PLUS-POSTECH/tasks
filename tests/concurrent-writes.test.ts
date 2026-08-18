import { beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";

import { getDatabase } from "@/lib/database/client";
import { seedDevelopmentDatabase } from "@/lib/database/development";
import { workflowStates, workspaces } from "@/lib/database/schema";
import { createWorkflowState } from "@/lib/workflow/actions";
import { defaultWorkflowStates, ensureWorkflowStates } from "@/lib/workflow/defaults";

import { signedInTest } from "./act-as";

beforeAll(async () => {
  await seedDevelopmentDatabase();
});

describe("a fresh deployment reached by several requests at once", () => {
  test("creates its default workflow exactly once", async () => {
    const database = await getDatabase();
    const [workspace] = await database
      .insert(workspaces)
      .values({ name: "Concurrent Bootstrap", slug: "concurrent-bootstrap" })
      .returning({ identifier: workspaces.identifier });
    expect(workspace).toBeDefined();
    try {
      // Every one of them finds no states and inserts the whole workflow, and the
      // names are unique per workspace.
      const workflows = await Promise.all(
        Array.from({ length: 8 }, () => ensureWorkflowStates(database, workspace!.identifier)),
      );
      for (const workflow of workflows) {
        expect(workflow.size).toBe(defaultWorkflowStates.length);
      }
      const stored = await database.query.workflowStates.findMany({
        where: eq(workflowStates.workspaceIdentifier, workspace!.identifier),
        columns: { name: true },
      });
      expect(stored).toHaveLength(defaultWorkflowStates.length);
    } finally {
      await database.delete(workspaces).where(eq(workspaces.identifier, workspace!.identifier));
    }
  });
});

describe("several people adding a workflow state at once", () => {
  signedInTest("gives every new state a position of its own", async () => {
    const database = await getDatabase();
    const names = ["Concurrent one", "Concurrent two", "Concurrent three", "Concurrent four", "Concurrent five"];
    try {
      await Promise.all(
        names.map((name) => createWorkflowState({ name, type: "backlog", color: "#8a8f98" })),
      );
      const created = await database.query.workflowStates.findMany({
        where: inArray(workflowStates.name, names),
        columns: { name: true, position: true },
      });
      expect(created).toHaveLength(names.length);
      expect(new Set(created.map((state) => state.position)).size).toBe(names.length);
    } finally {
      await database.delete(workflowStates).where(inArray(workflowStates.name, names));
    }
  });
});
