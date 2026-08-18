"use server";

import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/lib/database/client";
import { issues, workflowStateTypes, workflowStates, workspaces } from "@/lib/database/schema";
import { NotFoundError } from "@/lib/errors";
import { recordActivity, stateTimestamps } from "@/lib/issues/mutations";
import { action, adminAction } from "@/lib/session/action";
import { revalidateEverything } from "@/lib/utilities/revalidate";
import { hexColorSchema, identifierSchema } from "@/lib/validation/schemas";
import { getWorkspace } from "@/lib/workspace/queries";

const workflowStateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(workflowStateTypes),
  color: hexColorSchema,
});

export type WorkflowStateInput = z.input<typeof workflowStateSchema>;

/**
 * The type is set when a status is created and never again: it decides whether
 * an issue counts as completed, and retyping one would move every issue holding
 * it and destroy their completion dates. `strict` makes a caller that tries say
 * so out loud rather than have it quietly ignored.
 */
const workflowStatePatchSchema = workflowStateSchema.omit({ type: true }).partial().strict();

export type WorkflowStatePatch = z.input<typeof workflowStatePatchSchema>;

/**
 * The workspace row is held `for update` so the read of the neighbouring
 * positions and the insert are one step: two concurrent creates would otherwise
 * read the same neighbour and be given the same position.
 */
export const createWorkflowState = action(async (_actor, rawInput: WorkflowStateInput): Promise<void> => {
  const input = workflowStateSchema.parse(rawInput);
  const database = await getDatabase();
  const workspace = await getWorkspace();
  await database.transaction(async (transaction) => {
    await transaction
      .select({ identifier: workspaces.identifier })
      .from(workspaces)
      .where(eq(workspaces.identifier, workspace.identifier))
      .for("update");
    const siblings = await transaction.query.workflowStates.findMany({
      where: eq(workflowStates.workspaceIdentifier, workspace.identifier),
      orderBy: [asc(workflowStates.position)],
      columns: { position: true, type: true },
    });
    const lastOfType = [...siblings].reverse().find((state) => state.type === input.type);
    const position = lastOfType ? lastOfType.position + 0.5 : (siblings.at(-1)?.position ?? 0) + 1;
    await transaction.insert(workflowStates).values({
      ...input,
      workspaceIdentifier: workspace.identifier,
      position,
    });
  });
  revalidateEverything();
});

export const updateWorkflowState = action(
  async (_actor, stateIdentifier: string, rawPatch: WorkflowStatePatch): Promise<void> => {
    const parsedIdentifier = identifierSchema.parse(stateIdentifier);
    const patch = workflowStatePatchSchema.parse(rawPatch);
    const database = await getDatabase();
    await database
      .update(workflowStates)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(workflowStates.identifier, parsedIdentifier));
    revalidateEverything();
  },
);

export const reorderWorkflowState = action(
  async (_actor, stateIdentifier: string, position: number): Promise<void> => {
    const parsedIdentifier = identifierSchema.parse(stateIdentifier);
    const parsedPosition = z.number().finite().parse(position);
    const database = await getDatabase();
    await database
      .update(workflowStates)
      .set({ position: parsedPosition, updatedAt: new Date() })
      .where(eq(workflowStates.identifier, parsedIdentifier));
    revalidateEverything();
  },
);

/**
 * Moves the state's issues to a replacement and stamps them the same way a
 * single issue changing state is, down to one `state_changed` entry each.
 * Admin-only: it is the one workflow change that rewrites other people's issues.
 */
export const deleteWorkflowState = adminAction(
  async (actor, stateIdentifier: string, replacementStateIdentifier: string): Promise<void> => {
    const parsedIdentifier = identifierSchema.parse(stateIdentifier);
    const parsedReplacement = identifierSchema.parse(replacementStateIdentifier);
    if (parsedIdentifier === parsedReplacement) {
      throw new Error("Choose a different replacement state.");
    }
    const database = await getDatabase();
    await database.transaction(async (transaction) => {
      const deletedState = await transaction.query.workflowStates.findFirst({
        where: eq(workflowStates.identifier, parsedIdentifier),
        columns: { name: true, type: true },
      });
      const replacementState = await transaction.query.workflowStates.findFirst({
        where: eq(workflowStates.identifier, parsedReplacement),
        columns: { name: true, type: true },
      });
      if (!deletedState || !replacementState) {
        throw new NotFoundError("Workflow state not found.");
      }
      const moved = await transaction.query.issues.findMany({
        where: eq(issues.stateIdentifier, parsedIdentifier),
        columns: { identifier: true },
      });
      // Between two completed statuses `completedAt` is left out altogether,
      // carrying each issue's own date forward; there is no single value that
      // could be written over all of them.
      const patch =
        deletedState.type === "completed" && replacementState.type === "completed"
          ? { stateIdentifier: parsedReplacement, updatedAt: new Date() }
          : {
              stateIdentifier: parsedReplacement,
              ...(await stateTimestamps(transaction, parsedReplacement)),
              updatedAt: new Date(),
            };
      await transaction.update(issues).set(patch).where(eq(issues.stateIdentifier, parsedIdentifier));
      for (const issue of moved) {
        await recordActivity(transaction, issue.identifier, actor.identifier, {
          type: "state_changed",
          fromStateIdentifier: parsedIdentifier,
          fromStateName: deletedState.name,
          toStateIdentifier: parsedReplacement,
          toStateName: replacementState.name,
        });
      }
      await transaction.delete(workflowStates).where(eq(workflowStates.identifier, parsedIdentifier));
    });
    revalidateEverything();
  },
);
