import { z } from "zod";

import { DiscordApiError, discordJson, discordJsonIfPresent } from "./client";

const discordUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  global_name: z.string().nullable().optional(),
  discriminator: z.string().optional(),
  avatar: z.string().nullable().optional(),
  bot: z.boolean().optional(),
});

const discordProfileSchema = discordUserSchema.extend({
  email: z.string().nullable().optional(),
  verified: z.boolean().optional(),
});

export type DiscordUser = z.infer<typeof discordUserSchema>;
export type DiscordProfile = z.infer<typeof discordProfileSchema>;

const discordRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.number(),
  position: z.number(),
  managed: z.boolean().optional(),
  /** Permission bitfield, sent as a decimal string because it exceeds 2^53. */
  permissions: z.string().default("0"),
});

export type DiscordRole = z.infer<typeof discordRoleSchema>;

const discordGuildMemberSchema = z.object({
  user: discordUserSchema,
  nick: z.string().nullable().optional(),
  /** Server-specific avatar, which overrides the account's global one. */
  avatar: z.string().nullable().optional(),
  roles: z.array(z.string()),
});

export type DiscordGuildMember = z.infer<typeof discordGuildMemberSchema>;

const discordGuildSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().nullable().optional(),
  owner_id: z.string(),
});

export type DiscordGuild = z.infer<typeof discordGuildSchema>;

// ---- As the signed-in user (OAuth access token) ----------------------------

export const fetchDiscordProfile = async (accessToken: string): Promise<DiscordProfile> =>
  discordProfileSchema.parse(await discordJson({ url: "/users/@me", credential: { bearer: accessToken } }));

/** Guild identifiers the token's user belongs to (requires the `guilds` scope). */
export const fetchDiscordGuildIdentifiers = async (accessToken: string): Promise<readonly string[]> =>
  z
    .array(z.object({ id: z.string() }))
    .parse(await discordJson({ url: "/users/@me/guilds", credential: { bearer: accessToken } }))
    .map((guild) => guild.id);

// ---- As the bot -------------------------------------------------------------

export const fetchDiscordGuild = async (botToken: string, guildIdentifier: string): Promise<DiscordGuild> =>
  discordGuildSchema.parse(await discordJson({ url: `/guilds/${guildIdentifier}`, credential: { bot: botToken } }));

/** Roles defined on the server, highest first, excluding the implicit @everyone role. */
export const fetchDiscordGuildRoles = async (botToken: string, guildIdentifier: string): Promise<readonly DiscordRole[]> =>
  z
    .array(discordRoleSchema)
    .parse(await discordJson({ url: `/guilds/${guildIdentifier}/roles`, credential: { bot: botToken } }))
    .filter((role) => role.id !== guildIdentifier)
    .sort((left, right) => right.position - left.position);

/**
 * Absent is Discord's 404, which it answers both for somebody who is not in the
 * server and for a server the bot cannot see at all. The two are the same
 * answer on the wire, so absence is reported rather than an empty set of roles.
 */
export type DiscordMemberRoles =
  | { readonly present: true; readonly roleIdentifiers: readonly string[] }
  | { readonly present: false };

export const fetchDiscordMemberRoleIdentifiers = async (
  botToken: string,
  guildIdentifier: string,
  discordUserIdentifier: string,
): Promise<DiscordMemberRoles> => {
  const member = await discordJsonIfPresent({
    url: `/guilds/${guildIdentifier}/members/${discordUserIdentifier}`,
    credential: { bot: botToken },
  });
  return member.present
    ? { present: true, roleIdentifiers: discordGuildMemberSchema.pick({ roles: true }).parse(member.json).roles }
    : { present: false };
};

const guildMemberPageSize = 1000;

/** Listing members takes Discord longer to answer than the shared budget allows. */
const guildMemberPageTimeoutMilliseconds = 15_000;

const missingServerMembersIntentMessage =
  "Discord refused to list server members. Enable “Server Members Intent” for the bot (Developer Portal › Bot › Privileged Gateway Intents) and make sure the bot is in the server.";

const fetchDiscordGuildMemberPage = async (botToken: string, guildIdentifier: string, after: string): Promise<unknown> => {
  try {
    return await discordJson({
      url: `/guilds/${guildIdentifier}/members?limit=${guildMemberPageSize}&after=${after}`,
      credential: { bot: botToken },
      timeoutMilliseconds: guildMemberPageTimeoutMilliseconds,
    });
  } catch (error) {
    if (error instanceof DiscordApiError && error.status === 403) {
      throw new Error(missingServerMembersIntentMessage, { cause: error });
    }
    throw error;
  }
};

/**
 * `unreadableEntries` counts the entries Discord sent that did not fit the
 * member schema and were skipped. Whoever is missing from a listing looks like
 * somebody who left, so callers that act on absence have to know.
 */
export type DiscordGuildMemberListing = {
  readonly members: readonly DiscordGuildMember[];
  readonly unreadableEntries: number;
};

/** Enough of an entry to page past it, when the rest of it could not be read. */
const memberCursorSchema = z.object({ user: z.object({ id: z.string() }) });

const pageCursorOf = (entries: readonly unknown[]): string | null => {
  for (const entry of [...entries].reverse()) {
    const cursor = memberCursorSchema.safeParse(entry);
    if (cursor.success) {
      return cursor.data.user.id;
    }
  }
  return null;
};

/**
 * Every human member of the server. Requires the bot's "Server Members Intent"
 * (Developer Portal › Bot › Privileged Gateway Intents). An entry whose JSON
 * does not fit the schema is skipped and counted rather than failing the read.
 */
export const fetchDiscordGuildMembers = async (
  botToken: string,
  guildIdentifier: string,
): Promise<DiscordGuildMemberListing> => {
  const members: DiscordGuildMember[] = [];
  let unreadableEntries = 0;
  let after = "0";
  for (;;) {
    const entries = z.array(z.unknown()).parse(await fetchDiscordGuildMemberPage(botToken, guildIdentifier, after));
    for (const entry of entries) {
      const member = discordGuildMemberSchema.safeParse(entry);
      if (!member.success) {
        unreadableEntries += 1;
        console.warn(`[discord] Skipped a member the listing described in a way this app cannot read: ${member.error.message}`);
        continue;
      }
      if (!member.data.user.bot) {
        members.push(member.data);
      }
    }
    const cursor = pageCursorOf(entries);
    if (entries.length < guildMemberPageSize || cursor === null) {
      return { members, unreadableEntries };
    }
    after = cursor;
  }
};

// ---- Helpers ----------------------------------------------------------------

const cdnBase = "https://cdn.discordapp.com";

/** Rendered at 16–28 px, so one cached size covers every use at 2× density. */
const avatarPixelSize = 64;

const cdnUrl = (path: string, hash: string, size: number): string =>
  `${cdnBase}/${path}.${hash.startsWith("a_") ? "gif" : "png"}?size=${size}`;

export const discordAvatarUrl = (user: DiscordUser): string => {
  if (!user.avatar) {
    const index =
      user.discriminator === "0" || user.discriminator === undefined
        ? Number(BigInt(user.id) >> BigInt(22)) % 6
        : Number.parseInt(user.discriminator, 10) % 5;
    return `${cdnBase}/embed/avatars/${index}.png`;
  }
  return cdnUrl(`avatars/${user.id}/${user.avatar}`, user.avatar, avatarPixelSize);
};

export const discordMemberAvatarUrl = (guildIdentifier: string, member: DiscordGuildMember): string =>
  member.avatar
    ? cdnUrl(`guilds/${guildIdentifier}/users/${member.user.id}/avatars/${member.avatar}`, member.avatar, avatarPixelSize)
    : discordAvatarUrl(member.user);

export const discordGuildIconUrl = (guild: DiscordGuild): string | null =>
  guild.icon ? cdnUrl(`icons/${guild.id}/${guild.icon}`, guild.icon, 128) : null;
