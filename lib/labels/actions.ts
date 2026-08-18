"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/lib/database/client";
import { issueLabels, labels } from "@/lib/database/schema";
import { NotFoundError } from "@/lib/errors";
import { recordActivity } from "@/lib/issues/mutations";
import { action, adminAction } from "@/lib/session/action";
import { revalidateEverything } from "@/lib/utilities/revalidate";
import { hexColorSchema, identifierSchema } from "@/lib/validation/schemas";
import { getWorkspace } from "@/lib/workspace/queries";


const labelSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: hexColorSchema.default("#8a8f98"),
});

export type LabelInput = z.input<typeof labelSchema>;

export const createLabel = action(async (actor, rawInput: LabelInput): Promise<{ identifier: string }> => {
  const input = labelSchema.parse(rawInput);
  const database = await getDatabase();
  const workspace = await getWorkspace();
  const [created] = await database
    .insert(labels)
    .values({ ...input, workspaceIdentifier: workspace.identifier })
    .returning({ identifier: labels.identifier });
  if (!created) {
    throw new Error("Failed to create the label.");
  }
  revalidateEverything();
  return created;
});

export const updateLabel = action(async (actor, identifier: string, rawPatch: Partial<LabelInput>): Promise<void> => {
  const parsedIdentifier = identifierSchema.parse(identifier);
  const patch = labelSchema.partial().parse(rawPatch);
  const database = await getDatabase();
  await database.update(labels).set({ ...patch, updatedAt: new Date() }).where(eq(labels.identifier, parsedIdentifier));
  revalidateEverything();
});

/**
 * `issue_labels` cascades, so deleting a label strips it from every issue at
 * once — hence admin-only, and hence a `label_removed` entry written from the
 * `issue_labels` rows before the cascade takes them, in the same transaction.
 * Each carries the name, because the payload is plain JSON that outlives the
 * row the feed would otherwise resolve it against.
 */
export const deleteLabel = adminAction(async (actor, identifier: string): Promise<void> => {
  const parsedIdentifier = identifierSchema.parse(identifier);
  const database = await getDatabase();
  await database.transaction(async (transaction) => {
    const label = await transaction.query.labels.findFirst({
      where: eq(labels.identifier, parsedIdentifier),
      columns: { name: true },
    });
    if (!label) {
      throw new NotFoundError("Label not found.");
    }
    const tagged = await transaction.query.issueLabels.findMany({
      where: eq(issueLabels.labelIdentifier, parsedIdentifier),
      columns: { issueIdentifier: true },
    });
    for (const { issueIdentifier } of tagged) {
      await recordActivity(transaction, issueIdentifier, actor.identifier, {
        type: "label_removed",
        labelIdentifier: parsedIdentifier,
        labelName: label.name,
      });
    }
    await transaction.delete(labels).where(eq(labels.identifier, parsedIdentifier));
  });
  revalidateEverything();
});
