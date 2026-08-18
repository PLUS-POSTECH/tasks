/**
 * Members created by the member sync have no e-mail until they sign in, so they
 * get a stand-in address that no mail can reach.
 */
const placeholderDomain = "members.invalid";

export const placeholderEmail = (discordUserIdentifier: string): string =>
  `discord-${discordUserIdentifier}@${placeholderDomain}`;

export const isPlaceholderEmail = (email: string): boolean => email.endsWith(`@${placeholderDomain}`);
