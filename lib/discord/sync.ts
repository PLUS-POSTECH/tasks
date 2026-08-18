import { and, count, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";

import { grantsAdministrator } from "@/lib/auth/admin";
import { discordBotOf, loadAuthSettings, type DiscordBot } from "@/lib/auth/settings";
import { getDatabase, type Database } from "@/lib/database/client";
import { accounts, apiTokens, sessions, users, workspaces } from "@/lib/database/schema";
import { avatarColorFor, toHandle } from "@/lib/users/profile";

import { placeholderEmail } from "./placeholder-email";
import { slugify } from "@/lib/utilities/slug";
import { defaultWorkspaceSlug, workspaceSlugMaxLength } from "@/lib/workspace/defaults";
import { loadWorkspaceRow } from "@/lib/workspace/row";

import {
  discordGuildIconUrl,
  discordMemberAvatarUrl,
  fetchDiscordGuild,
  fetchDiscordGuildMembers,
  fetchDiscordGuildRoles,
  type DiscordGuildMember,
  type DiscordGuildMemberListing,
} from "./api";

/**
 * Mirrors the Discord server into the workspace. Everything here needs the bot
 * token, and listing members needs the Server Members Intent.
 */

const memberName = (member: DiscordGuildMember): string =>
  member.nick?.trim() || member.user.global_name?.trim() || member.user.username;

const backfillDiscordIdentifiers = async (database: Database): Promise<void> => {
  const linked = await database
    .select({ userId: accounts.userId, accountId: accounts.accountId })
    .from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(and(eq(accounts.providerId, "discord"), isNull(users.discordUserIdentifier)));
  for (const row of linked) {
    await database.update(users).set({ discordUserIdentifier: row.accountId }).where(eq(users.id, row.userId));
  }
};

const sameIdentifiers = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((identifier, index) => identifier === right[index]);

/**
 * The slug follows the server name only while it is still the placeholder a
 * fresh deployment starts with, so a slug chosen in settings is kept.
 */
const syncGuildProfile = async (database: Database, bot: DiscordBot, workspaceIdentifier: string): Promise<string> => {
  const [guild, roles, workspace] = await Promise.all([
    fetchDiscordGuild(bot.token, bot.guildIdentifier),
    fetchDiscordGuildRoles(bot.token, bot.guildIdentifier),
    loadWorkspaceRow(),
  ]);
  const iconUrl = discordGuildIconUrl(guild);
  const slug = workspace.slug === defaultWorkspaceSlug ? slugify(guild.name, defaultWorkspaceSlug, workspaceSlugMaxLength) : workspace.slug;
  const administratorRoleIdentifiers = roles.filter(grantsAdministrator).map((role) => role.id);
  if (
    workspace.name === guild.name &&
    workspace.iconUrl === iconUrl &&
    workspace.slug === slug &&
    workspace.discordOwnerIdentifier === guild.owner_id &&
    sameIdentifiers(workspace.discordAdministratorRoleIdentifiers, administratorRoleIdentifiers)
  ) {
    return guild.name;
  }
  await database
    .update(workspaces)
    .set({
      name: guild.name,
      iconUrl,
      slug,
      discordOwnerIdentifier: guild.owner_id,
      discordAdministratorRoleIdentifiers: administratorRoleIdentifiers,
      updatedAt: new Date(),
    })
    .where(eq(workspaces.identifier, workspaceIdentifier));
  console.info(`[discord] Workspace now mirrors the server “${guild.name}”.`);
  return guild.name;
};

/**
 * A departed member's reminders stay: a reminder belongs to the issue it posts,
 * not to whoever scheduled it. Callers must pass a non-empty roster, or
 * everyone carrying a Discord identity is flagged as departed.
 */
const sweepDepartedMembers = async (
  database: Database,
  memberIdentifiers: readonly string[],
  now: Date,
): Promise<number> => {
  const departed = await database
    .update(users)
    .set({ leftGuildAt: now, discordRoleIdentifiers: [], updatedAt: now })
    .where(
      and(
        isNull(users.leftGuildAt),
        isNotNull(users.discordUserIdentifier),
        notInArray(users.discordUserIdentifier, [...memberIdentifiers]),
      ),
    )
    .returning({ id: users.id });
  if (departed.length > 0) {
    const departedIdentifiers = departed.map((row) => row.id);
    await database.delete(sessions).where(inArray(sessions.userId, departedIdentifiers));
    await database.delete(apiTokens).where(inArray(apiTokens.userIdentifier, departedIdentifiers));
  }
  return departed.length;
};

const countPresentDiscordMembers = async (database: Database): Promise<number> => {
  const [present] = await database
    .select({ total: count() })
    .from(users)
    .where(and(isNull(users.leftGuildAt), isNotNull(users.discordUserIdentifier)));
  return present?.total ?? 0;
};

/**
 * Why the sweep must be refused, or null when the roster can be acted on. A
 * short listing reads exactly like a server everybody walked out of, and
 * acting on it flags every member as departed and deletes every session.
 */
const sweepRefusal = (listing: DiscordGuildMemberListing, presentBefore: number): string | null => {
  if (listing.members.length === 0) {
    return "the listing came back empty, which is what a failed read looks like: Discord answering with nothing, or a server ID pointing somewhere the bot is alone";
  }
  if (listing.unreadableEntries > 0) {
    return `${listing.unreadableEntries} of its entries could not be read, so it is missing members rather than describing a smaller server`;
  }
  if (listing.members.length * 2 < presentBefore) {
    return `it names ${listing.members.length} of the ${presentBefore} members the workspace knew, and a roster does not lose half a server between two syncs`;
  }
  return null;
};

export type GuildSyncResult = {
  readonly name: string;
  readonly added: number;
  readonly updated: number;
  readonly left: number;
  readonly total: number;
  /**
   * Why nobody was marked as having left, or null. Callers have to report it:
   * the members the pass did update make a refused sweep look like a clean one.
   */
  readonly sweepRefusal: string | null;
};

type SyncOutcome =
  | { readonly mirrored: true; readonly at: Date; readonly problem: string | null }
  | { readonly mirrored: false; readonly problem: string };

const syncErrorCharacterLimit = 300;

/**
 * A failed pass skips the sweep, so somebody who left the server keeps their
 * session, their API tokens and their role-derived admin until it works again.
 */
const recordSyncOutcome = async (
  database: Database,
  workspaceIdentifier: string,
  outcome: SyncOutcome,
): Promise<void> => {
  // A failed pass leaves `discordSyncedAt` alone, so it says how old the
  // mirror is rather than when it was last attempted.
  await database
    .update(workspaces)
    .set({
      ...(outcome.mirrored ? { discordSyncedAt: outcome.at } : {}),
      discordSyncError: outcome.problem,
      updatedAt: new Date(),
    })
    .where(eq(workspaces.identifier, workspaceIdentifier));
};

const mirrorGuild = async (database: Database, bot: DiscordBot, workspaceIdentifier: string): Promise<GuildSyncResult> => {
  const [name, listing] = await Promise.all([
    syncGuildProfile(database, bot, workspaceIdentifier),
    fetchDiscordGuildMembers(bot.token, bot.guildIdentifier),
  ]);
  const { members } = listing;
  await backfillDiscordIdentifiers(database);
  // Must be counted before the loop below puts the listed members back, or
  // there is nothing to judge the listing's length against.
  const presentBefore = await countPresentDiscordMembers(database);
  const now = new Date();
  let added = 0;
  let updated = 0;

  for (const member of members) {
    const existing = await database.query.users.findFirst({
      where: eq(users.discordUserIdentifier, member.user.id),
      columns: { id: true },
    });
    const profile = {
      name: memberName(member),
      displayName: toHandle(member.user.username),
      image: discordMemberAvatarUrl(bot.guildIdentifier, member),
      discordRoleIdentifiers: member.roles,
      discordRolesSyncedAt: now,
      discordRolesFailedAt: null,
      leftGuildAt: null,
      updatedAt: now,
    };
    if (existing) {
      await database.update(users).set(profile).where(eq(users.id, existing.id));
      updated += 1;
    } else {
      await database.insert(users).values({
        workspaceIdentifier,
        email: placeholderEmail(member.user.id),
        emailVerified: false,
        avatarColor: avatarColorFor(member.user.id),
        discordUserIdentifier: member.user.id,
        ...profile,
      });
      added += 1;
    }
  }

  const refusal = sweepRefusal(listing, presentBefore);
  if (refusal !== null) {
    console.warn(
      `[discord] Nobody was marked as having left “${name}”: ${refusal}.`,
    );
    return { name, added, updated, left: 0, total: members.length, sweepRefusal: refusal };
  }

  const left = await sweepDepartedMembers(database, members.map((member) => member.user.id), now);
  console.info(`[discord] Synced ${members.length} members of “${name}”: ${added} added, ${updated} updated, ${left} left.`);
  return { name, added, updated, left, total: members.length, sweepRefusal: null };
};

export const syncDiscordGuild = async (): Promise<GuildSyncResult> => {
  const [database, settings] = await Promise.all([getDatabase(), loadAuthSettings()]);
  const bot = discordBotOf(settings);
  if (!bot) {
    throw new Error("A Discord bot token and server ID are required to sync with Discord.");
  }
  try {
    const result = await mirrorGuild(database, bot, settings.workspaceIdentifier);
    await recordSyncOutcome(database, settings.workspaceIdentifier, {
      mirrored: true,
      at: new Date(),
      problem: result.sweepRefusal === null ? null : `Nobody was marked as having left: ${result.sweepRefusal}.`,
    });
    return result;
  } catch (error) {
    // The original error must survive a failure to record it.
    await recordSyncOutcome(database, settings.workspaceIdentifier, {
      mirrored: false,
      problem: (error instanceof Error ? error.message : String(error)).slice(0, syncErrorCharacterLimit),
    }).catch((recordingFailure: unknown) =>
      console.warn("[discord] Could not record the failed sync on the workspace.", recordingFailure),
    );
    throw error;
  }
};

/**
 * Called during sign-in: attaches the real e-mail and the Discord account to a
 * synced placeholder row so better-auth signs into it rather than creating a
 * second user.
 */
export const linkSyncedMember = async (
  database: Database,
  profile: { readonly id: string; readonly email: string; readonly verified: boolean },
): Promise<void> => {
  const existing = await database.query.users.findFirst({
    where: eq(users.discordUserIdentifier, profile.id),
    columns: { id: true, email: true },
  });
  if (!existing) {
    return;
  }
  const account = await database.query.accounts.findFirst({
    where: and(eq(accounts.providerId, "discord"), eq(accounts.accountId, profile.id)),
    columns: { id: true },
  });
  if (account) {
    return;
  }
  const email = profile.email.toLowerCase();
  const emailTaken = await database.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true },
  });
  await database
    .update(users)
    .set({
      ...(emailTaken && emailTaken.id !== existing.id ? {} : { email, emailVerified: profile.verified }),
      leftGuildAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, existing.id));
  await database.insert(accounts).values({ userId: existing.id, providerId: "discord", accountId: profile.id });
};
