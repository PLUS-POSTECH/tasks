import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "@/lib/database/client";
import { accounts, users } from "@/lib/database/schema";
import { discordAvatarUrl, fetchDiscordGuildIdentifiers, fetchDiscordProfile, type DiscordProfile } from "@/lib/discord/api";
import { linkSyncedMember } from "@/lib/discord/sync";
import { avatarColorFor, toHandle } from "@/lib/users/profile";
import { loadWorkspaceRow } from "@/lib/workspace/row";

import type { AuthSettings } from "./settings";

/** Sign-in lifecycle; `server.ts` wires these into better-auth. */

/**
 * Only members of the workspace's Discord server may sign in; null refuses.
 */
export const authorizeDiscordSignIn = async (
  database: Database,
  settings: AuthSettings,
  accessToken: string,
): Promise<DiscordProfile | null> => {
  const requiredGuild = settings.discordGuildIdentifier?.trim();
  if (!requiredGuild) {
    console.warn("[auth] No Discord server is configured on the workspace; refusing sign-in.");
    return null;
  }
  const guilds = await fetchDiscordGuildIdentifiers(accessToken);
  if (!guilds.includes(requiredGuild)) {
    console.warn("[auth] Discord user is not a member of the configured server; refusing sign-in.");
    return null;
  }
  const profile = await fetchDiscordProfile(accessToken);
  if (!profile.email) {
    return null;
  }
  // A member row may already exist from the server sync; attach this login to it.
  await linkSyncedMember(database, { id: profile.id, email: profile.email, verified: profile.verified ?? false });
  return profile;
};

export const userFromDiscordProfile = (profile: DiscordProfile & { readonly email: string }) => ({
  id: profile.id,
  name: profile.global_name || profile.username,
  email: profile.email,
  emailVerified: profile.verified ?? false,
  image: discordAvatarUrl(profile),
  displayName: toHandle(profile.username),
});

type NewUser = { readonly email: string; readonly displayName?: unknown };

/**
 * Fills the workspace-specific columns of a member better-auth is creating.
 * Nobody becomes an admin by signing in: admin follows the Discord server.
 */
export const completeNewMember = async <User extends NewUser>(database: Database, user: User) => {
  const workspace = await loadWorkspaceRow();
  const providedDisplayName = typeof user.displayName === "string" && user.displayName.length > 0 ? user.displayName : null;
  return {
    ...user,
    workspaceIdentifier: workspace.identifier,
    displayName: providedDisplayName ?? toHandle(user.email.split("@")[0] ?? ""),
    avatarColor: avatarColorFor(),
  };
};

/** Remembers the member's Discord ID for the member sync. */
export const onSessionCreated = async (database: Database, userIdentifier: string): Promise<void> => {
  const account = await database.query.accounts.findFirst({
    where: and(eq(accounts.userId, userIdentifier), eq(accounts.providerId, "discord")),
    columns: { accountId: true },
  });
  if (account) {
    await database
      .update(users)
      .set({ discordUserIdentifier: account.accountId, leftGuildAt: null })
      .where(and(eq(users.id, userIdentifier), isNull(users.discordUserIdentifier)));
  }
};
