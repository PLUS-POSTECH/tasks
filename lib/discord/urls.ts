/** Discord URLs safe to build in the browser (no API client involved). */

/** URL that invites the application's bot into a server; no permissions are needed. */
export const discordBotInviteUrl = (clientIdentifier: string): string =>
  `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientIdentifier)}&scope=bot&permissions=0`;
