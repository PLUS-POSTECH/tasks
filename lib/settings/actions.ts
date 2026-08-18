"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { discordBotOf, getAuthSettings } from "@/lib/auth/settings";
import { getDatabase } from "@/lib/database/client";
import { users, workspaces } from "@/lib/database/schema";
import { syncDiscordGuild, type GuildSyncResult } from "@/lib/discord/sync";
import { NotFoundError } from "@/lib/errors";
import { rescheduleAllReminders } from "@/lib/reminders/dispatch";
import { isValidTimeZone } from "@/lib/reminders/schedule";
import { action, adminAction } from "@/lib/session/action";
import { attempt, type ActionResult } from "@/lib/utilities/action-result";
import { revalidateEverything } from "@/lib/utilities/revalidate";
import { discordSnowflakeSchema, hexColorSchema, identifierSchema } from "@/lib/validation/schemas";
import { getWorkspace } from "@/lib/workspace/queries";

const workspaceSchema = z.object({
  /** Ignored while the workspace mirrors a Discord server, which owns the name. */
  name: z.string().trim().min(1).max(100).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, "Use lowercase letters, numbers, and dashes."),
  timezone: z.string().trim().refine(isValidTimeZone, "Enter an IANA time zone such as Asia/Seoul."),
});

export const updateWorkspace = adminAction(
  async (_actor, rawInput: z.input<typeof workspaceSchema>): Promise<void> => {
    const { name, ...input } = workspaceSchema.parse(rawInput);
    const [database, workspace, settings] = await Promise.all([getDatabase(), getWorkspace(), getAuthSettings()]);
    const mirrorsDiscord = discordBotOf(settings) !== null;
    await database
      .update(workspaces)
      .set({ ...input, ...(name && !mirrorsDiscord ? { name } : {}), updatedAt: new Date() })
      .where(eq(workspaces.identifier, workspace.identifier));
    if (input.timezone !== workspace.timezone) {
      await rescheduleAllReminders(database);
    }
    revalidateEverything();
  },
);

/**
 * For the roles a server calls senior without giving them Discord's own
 * permission: its owner and its Administrator roles are always admins here and
 * are not listed.
 */
export const setAdminRoles = adminAction(async (_actor, roleIdentifiers: readonly string[]): Promise<void> => {
  const parsed = z.array(discordSnowflakeSchema).max(20).parse(roleIdentifiers);
  const [database, workspace] = await Promise.all([getDatabase(), getWorkspace()]);
  await database
    .update(workspaces)
    .set({ adminRoleIdentifiers: [...new Set(parsed)], updatedAt: new Date() })
    .where(eq(workspaces.identifier, workspace.identifier));
  revalidateEverything();
});

const profileSchema = z.object({
  /** Ignored while the workspace mirrors a Discord server, which owns member names. */
  name: z.string().trim().min(1).max(100).optional(),
  /** Ignored on the same terms: the sync mirrors the Discord username onto it. */
  displayName: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{1,32}$/, "Use lowercase letters, numbers, dots, dashes, or underscores.")
    .optional(),
  email: z.email(),
  avatarColor: hexColorSchema,
});

/**
 * An e-mail address is unique per workspace, so one already taken is answered
 * as a refusal the form can show rather than left to the unique index.
 */
export const updateOwnProfile = action(async (actor, rawInput: z.input<typeof profileSchema>): Promise<ActionResult<void>> => {
  const { name, displayName, ...input } = profileSchema.parse(rawInput);
  const [database, settings] = await Promise.all([getDatabase(), getAuthSettings()]);
  const mirrorsDiscord = discordBotOf(settings) !== null;
  const emailHolder = await database.query.users.findFirst({
    where: and(eq(users.workspaceIdentifier, actor.workspaceIdentifier), eq(users.email, input.email)),
    columns: { id: true },
  });
  if (emailHolder && emailHolder.id !== actor.identifier) {
    return { ok: false, error: "Another member already uses that email address." };
  }
  await database
    .update(users)
    .set({
      ...input,
      ...(name && !mirrorsDiscord ? { name } : {}),
      ...(displayName && !mirrorsDiscord ? { displayName } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, actor.identifier));
  revalidateEverything();
  return { ok: true, value: undefined };
});

export const setMemberAdmin = adminAction(async (_actor, userIdentifier: string, isAdmin: boolean): Promise<void> => {
  const parsedIdentifier = identifierSchema.parse(userIdentifier);
  const database = await getDatabase();
  await database.update(users).set({ isAdmin, updatedAt: new Date() }).where(eq(users.id, parsedIdentifier));
  revalidateEverything();
});

/**
 * What they wrote stays: their comments, updates, issues and history detach
 * from the row rather than going with it. Removing somebody still in the
 * Discord server is refused, because the sync would put the row back within
 * ten minutes under a new identifier that nothing points at.
 */
export const removeMember = adminAction(async (actor, userIdentifier: string): Promise<void> => {
  const parsedIdentifier = identifierSchema.parse(userIdentifier);
  if (parsedIdentifier === actor.identifier) {
    throw new Error("You cannot remove yourself.");
  }
  const database = await getDatabase();
  const member = await database.query.users.findFirst({
    where: eq(users.id, parsedIdentifier),
    columns: { discordUserIdentifier: true, leftGuildAt: true },
  });
  if (!member) {
    throw new NotFoundError("Member not found.");
  }
  if (member.discordUserIdentifier !== null && member.leftGuildAt === null) {
    throw new Error("Membership follows the Discord server; remove them there.");
  }
  await database.delete(users).where(eq(users.id, parsedIdentifier));
  revalidateEverything();
});

export const syncMembersNow = action(async (): Promise<ActionResult<GuildSyncResult>> => {
  const result = await attempt(syncDiscordGuild, "Sync failed.");
  if (result.ok) {
    revalidateEverything();
  }
  return result;
});
