"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/lib/database/client";
import { apiTokens } from "@/lib/database/schema";
import { action } from "@/lib/session/action";
import { identifierSchema } from "@/lib/validation/schemas";

import { generateApiToken } from "./tokens";

const nameSchema = z.string().trim().min(1).max(60);

/** Creates a token for the signed-in member and returns the plain value once. */
export const createApiToken = action(async (actor, rawName: string): Promise<{ readonly token: string }> => {
  const name = nameSchema.parse(rawName);
  const database = await getDatabase();
  const generated = await generateApiToken();
  await database.insert(apiTokens).values({
    userIdentifier: actor.identifier,
    name,
    tokenHash: generated.hash,
    tokenPrefix: generated.prefix,
  });
  revalidatePath("/settings/account");
  return { token: generated.token };
});

export const revokeApiToken = action(async (actor, tokenIdentifier: string): Promise<void> => {
  const parsedIdentifier = identifierSchema.parse(tokenIdentifier);
  const database = await getDatabase();
  await database
    .delete(apiTokens)
    .where(and(eq(apiTokens.identifier, parsedIdentifier), eq(apiTokens.userIdentifier, actor.identifier)));
  revalidatePath("/settings/account");
});
