import { and, eq } from "drizzle-orm";
import { cache } from "react";

import { getDatabase } from "@/lib/database/client";
import { accounts, users } from "@/lib/database/schema";

import { fetchDiscordGuildRoles, fetchDiscordMemberRoleIdentifiers, type DiscordRole } from "./api";
import { discordBotOf, getAuthSettings } from "@/lib/auth/settings";

/** How long a member's role snapshot is trusted before the bot re-reads it. */
const roleSnapshotLifetimeMilliseconds = 5 * 60 * 1000;

/**
 * How long a failed read holds the bot off, so a Discord outage does not cost
 * every member a call on every click. The member sync, not this path, catches
 * the workspace up once Discord answers again.
 */
const roleRefreshRetryMilliseconds = 15 * 60 * 1000;

const isFresh = (syncedAt: Date | null): boolean =>
  syncedAt !== null && Date.now() - syncedAt.getTime() < roleSnapshotLifetimeMilliseconds;

const isHeldOff = (failedAt: Date | null): boolean =>
  failedAt !== null && Date.now() - failedAt.getTime() < roleRefreshRetryMilliseconds;

/**
 * The snapshot on the user row, refreshed through the bot when stale. If the
 * bot cannot answer, the last snapshot stands and the bot is left alone for a
 * while.
 */
export const getDiscordRoleIdentifiers = cache(
  async (userIdentifier: string): Promise<readonly string[]> => {
    const database = await getDatabase();
    const user = await database.query.users.findFirst({
      where: eq(users.id, userIdentifier),
      columns: { discordRoleIdentifiers: true, discordRolesSyncedAt: true, discordRolesFailedAt: true },
    });
    if (!user) {
      return [];
    }
    if (isFresh(user.discordRolesSyncedAt) || isHeldOff(user.discordRolesFailedAt)) {
      return user.discordRoleIdentifiers;
    }
    const bot = discordBotOf(await getAuthSettings());
    if (!bot) {
      return user.discordRoleIdentifiers;
    }
    const account = await database.query.accounts.findFirst({
      where: and(eq(accounts.userId, userIdentifier), eq(accounts.providerId, "discord")),
      columns: { accountId: true },
    });
    if (!account) {
      return user.discordRoleIdentifiers;
    }
    const holdOffRefresh = async (): Promise<readonly string[]> => {
      await database
        .update(users)
        .set({ discordRolesFailedAt: new Date() })
        .where(eq(users.id, userIdentifier));
      return user.discordRoleIdentifiers;
    };
    try {
      const roles = await fetchDiscordMemberRoleIdentifiers(bot.token, bot.guildIdentifier, account.accountId);
      if (!roles.present) {
        // Discord answers 404 both for a member who is not in the server and
        // for a server the bot cannot see at all, so an absent member is no
        // evidence that anybody lost their roles. Who is still in the server is
        // the member sync's answer to give.
        console.warn(
          `[discord] The server did not list member ${account.accountId}; keeping their last known roles. The member sync decides who has left.`,
        );
        return await holdOffRefresh();
      }
      await database
        .update(users)
        .set({
          discordRoleIdentifiers: roles.roleIdentifiers,
          discordRolesSyncedAt: new Date(),
          discordRolesFailedAt: null,
        })
        .where(eq(users.id, userIdentifier));
      return roles.roleIdentifiers;
    } catch (error) {
      console.warn("[discord] Could not refresh Discord roles; using the last snapshot.", error);
      return await holdOffRefresh();
    }
  },
);

/**
 * Null when the bot is not set up or Discord cannot be reached; callers fall
 * back to the role names they stored.
 */
export const listDiscordRoles = cache(async (): Promise<readonly DiscordRole[] | null> => {
  const bot = discordBotOf(await getAuthSettings());
  if (!bot) {
    return null;
  }
  try {
    return await fetchDiscordGuildRoles(bot.token, bot.guildIdentifier);
  } catch (error) {
    console.warn("[discord] Could not list Discord roles.", error);
    return null;
  }
});
