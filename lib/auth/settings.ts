import { cache } from "react";

import { getWorkspaceRow, loadWorkspaceRow, type WorkspaceRow } from "@/lib/workspace/row";

/**
 * Lives on the workspace row so it can be changed from the settings UI instead
 * of environment variables.
 */
export type AuthSettings = {
  readonly workspaceIdentifier: string;
  readonly baseUrl: string | null;
  readonly secret: string;
  readonly discordClientIdentifier: string | null;
  readonly discordClientSecret: string | null;
  readonly discordGuildIdentifier: string | null;
  readonly discordBotToken: string | null;
  readonly adminRoleIdentifiers: readonly string[];
};

const authSettingsOf = (workspace: WorkspaceRow): AuthSettings => ({
  workspaceIdentifier: workspace.identifier,
  baseUrl: workspace.authBaseUrl,
  secret: workspace.authSecret,
  discordClientIdentifier: workspace.discordClientIdentifier,
  discordClientSecret: workspace.discordClientSecret,
  discordGuildIdentifier: workspace.discordGuildIdentifier,
  discordBotToken: workspace.discordBotToken,
  adminRoleIdentifiers: workspace.adminRoleIdentifiers,
});

/**
 * Reads the row afresh: callers that have just saved settings need the values
 * they wrote, not the ones the request read before.
 */
export const loadAuthSettings = async (): Promise<AuthSettings> => authSettingsOf(await loadWorkspaceRow());

/** The same projection for a request that is only reading, over one shared row read. */
export const getAuthSettings = cache(async (): Promise<AuthSettings> => authSettingsOf(await getWorkspaceRow()));

/** True once a Discord application has been configured, i.e. sign-in can work. */
export const isAuthConfigured = (settings: AuthSettings): boolean =>
  Boolean(settings.baseUrl && settings.discordClientIdentifier && settings.discordClientSecret);

export type DiscordBot = { readonly token: string; readonly guildIdentifier: string };

export const discordBotOf = (settings: AuthSettings): DiscordBot | null =>
  settings.discordBotToken && settings.discordGuildIdentifier
    ? { token: settings.discordBotToken, guildIdentifier: settings.discordGuildIdentifier }
    : null;

/** Values shown in the settings UI; the client secret is never sent to the browser. */
export type PublicAuthSettings = {
  readonly baseUrl: string;
  readonly discordClientIdentifier: string;
  readonly hasDiscordClientSecret: boolean;
  readonly discordGuildIdentifier: string;
  readonly hasDiscordBotToken: boolean;
  readonly adminRoleIdentifiers: readonly string[];
};

export const toPublicAuthSettings = (settings: AuthSettings): PublicAuthSettings => ({
  baseUrl: settings.baseUrl ?? "",
  discordClientIdentifier: settings.discordClientIdentifier ?? "",
  hasDiscordClientSecret: Boolean(settings.discordClientSecret),
  discordGuildIdentifier: settings.discordGuildIdentifier ?? "",
  hasDiscordBotToken: Boolean(settings.discordBotToken),
  adminRoleIdentifiers: settings.adminRoleIdentifiers,
});

