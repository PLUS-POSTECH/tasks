"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/lib/database/client";
import { ForbiddenError } from "@/lib/errors";
import { hasAnyAdmin } from "./admin";
import { workspaces } from "@/lib/database/schema";
import { syncDiscordGuild } from "@/lib/discord/sync";
import { publicAction } from "@/lib/session/action";
import { findCurrentUser } from "@/lib/session/current-user";
import { revalidateEverything } from "@/lib/utilities/revalidate";
import { discordSnowflakeSchema } from "@/lib/validation/schemas";

import { isAuthConfigured, loadAuthSettings, type AuthSettings } from "./settings";

const authSettingsSchema = z.object({
  baseUrl: z.url().transform((value) => value.replace(/\/+$/, "")),
  discordClientIdentifier: discordSnowflakeSchema,
  /** Empty keeps the stored secret. */
  discordClientSecret: z.string().trim().max(200),
  discordGuildIdentifier: z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? null : value))
    .pipe(discordSnowflakeSchema.nullable()),
  /** Empty keeps the stored token; null removes it. */
  discordBotToken: z.string().trim().max(200).nullable().default(""),
  /** Discord roles whose holders are admins here, alongside the server's own. */
  adminRoleIdentifiers: z
    .string()
    .trim()
    .max(500)
    .default("")
    .transform((value) => value.split(",").map((identifier) => identifier.trim()).filter((identifier) => identifier.length > 0))
    .pipe(z.array(discordSnowflakeSchema).max(20)),
});

export type AuthSettingsInput = z.input<typeof authSettingsSchema>;

/** The columns this action owns, as one value, so a failed setup can be undone. */
type StoredAuthSettings = {
  readonly authBaseUrl: string | null;
  readonly discordClientIdentifier: string | null;
  readonly discordClientSecret: string | null;
  readonly discordGuildIdentifier: string | null;
  readonly discordBotToken: string | null;
  readonly adminRoleIdentifiers: readonly string[];
};

const storedAuthSettingsOf = (settings: AuthSettings): StoredAuthSettings => ({
  authBaseUrl: settings.baseUrl,
  discordClientIdentifier: settings.discordClientIdentifier,
  discordClientSecret: settings.discordClientSecret,
  discordGuildIdentifier: settings.discordGuildIdentifier,
  discordBotToken: settings.discordBotToken,
  adminRoleIdentifiers: settings.adminRoleIdentifiers,
});

const writeAuthSettings = async (workspaceIdentifier: string, values: StoredAuthSettings): Promise<void> => {
  const database = await getDatabase();
  await database
    .update(workspaces)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(workspaces.identifier, workspaceIdentifier));
};

/**
 * Puts the previous settings back when the first save produced no admin:
 * settings that named nobody would close `/setup` on a deployment nobody can
 * correct through the app at all.
 */
const finishBootstrap = async (previous: AuthSettings): Promise<void> => {
  try {
    await syncDiscordGuild();
    if (!(await hasAnyAdmin())) {
      throw new Error("the server was read, but nobody in it is an admin here");
    }
  } catch (error: unknown) {
    await writeAuthSettings(previous.workspaceIdentifier, storedAuthSettingsOf(previous));
    throw new Error(
      "Nothing was saved: setup needs to read the Discord server, and could not. Check the bot is in the server and that its Server Members Intent is switched on, then try again.",
      { cause: error },
    );
  }
};

/**
 * Public only while the deployment is still being set up, and the gate closes
 * on sign-in being configured *and* somebody being an admin: either alone
 * leaves the action open to anonymous callers, who could repoint the workspace
 * at a Discord server of their own. So the first save has to carry a bot token
 * it can use — every route to being an admin needs the sync to have read the
 * server at least once.
 */
export const updateAuthSettings = publicAction(async (rawInput: AuthSettingsInput): Promise<void> => {
  const input = authSettingsSchema.parse(rawInput);
  const current = await loadAuthSettings();
  const bootstrapping = !isAuthConfigured(current) && !(await hasAnyAdmin());
  if (!bootstrapping) {
    const currentUser = await findCurrentUser();
    if (!currentUser) {
      throw new Error("Sign in to change authentication settings.");
    }
    if (!currentUser.isAdmin) {
      throw new ForbiddenError("Only admins can change authentication settings.");
    }
  }
  // Pointing a running deployment at a different server would sweep every
  // current member as departed — sessions and API tokens deleted — and
  // re-derive admin from the other server's owner. None of that comes back.
  // Setup may still correct it, because until it finishes there is nothing
  // to lose.
  if (!bootstrapping && current.discordGuildIdentifier !== null && input.discordGuildIdentifier !== current.discordGuildIdentifier) {
    throw new Error(
      "The Discord server cannot be changed once it is set: every member, session and reminder here belongs to it. Set up a new deployment to use a different server.",
    );
  }
  const discordClientSecret = input.discordClientSecret.length > 0 ? input.discordClientSecret : current.discordClientSecret;
  if (!discordClientSecret) {
    throw new Error("A Discord client secret is required.");
  }
  const discordBotToken =
    input.discordBotToken === null ? null : input.discordBotToken.length > 0 ? input.discordBotToken : current.discordBotToken;
  if (bootstrapping && !(discordBotToken && input.discordGuildIdentifier)) {
    throw new Error(
      "A Discord server ID and bot token are required to finish setup: reading the server is what makes its owner and Administrator roles admins here, and until somebody is an admin anyone can change these settings.",
    );
  }
  await writeAuthSettings(current.workspaceIdentifier, {
    authBaseUrl: input.baseUrl,
    discordClientIdentifier: input.discordClientIdentifier,
    discordClientSecret,
    discordGuildIdentifier: input.discordGuildIdentifier,
    discordBotToken,
    adminRoleIdentifiers: input.adminRoleIdentifiers,
  });
  if (discordBotToken && input.discordGuildIdentifier) {
    if (!bootstrapping) {
      // There is already an admin, so a server that cannot be read costs a
      // sync rather than the ability to change these settings again.
      await syncDiscordGuild().catch((error: unknown) =>
        console.warn("[auth] Saved, but could not read the Discord server yet.", error),
      );
    } else {
      await finishBootstrap(current);
    }
  }
  revalidateEverything();
});
