import { cache } from "react";

import { getWorkspaceRow } from "./row";

export type WorkspaceSummary = {
  readonly identifier: string;
  readonly name: string;
  readonly slug: string;
  /** Discord server icon mirrored onto the workspace; null when there is none. */
  readonly iconUrl: string | null;
  /** IANA time zone used for due dates and reminders. */
  readonly timezone: string;
};

export const getWorkspace = cache(async (): Promise<WorkspaceSummary> => {
  const workspace = await getWorkspaceRow();
  return {
    identifier: workspace.identifier,
    name: workspace.name,
    slug: workspace.slug,
    iconUrl: workspace.iconUrl,
    timezone: workspace.timezone,
  };
});

export type DiscordSyncHealth = {
  /** When the mirror last wrote what it read; null before the first pass. */
  readonly syncedAt: Date | null;
  /** Why it is not to be trusted right now; null while it is healthy. */
  readonly error: string | null;
};

export const getDiscordSyncHealth = cache(async (): Promise<DiscordSyncHealth> => {
  const workspace = await getWorkspaceRow();
  return { syncedAt: workspace.discordSyncedAt, error: workspace.discordSyncError };
});
