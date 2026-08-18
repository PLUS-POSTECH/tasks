const avatarPalette = ["#5e6ad2", "#26b5ce", "#f2994a", "#eb5757", "#27ae60", "#bb87fc", "#f7c948", "#4ea7fc"] as const;

/** Stable colour for a member, derived from their Discord ID (or random when unknown). */
export const avatarColorFor = (discordUserIdentifier?: string): string => {
  const index =
    discordUserIdentifier && /^\d+$/.test(discordUserIdentifier)
      ? Number(BigInt(discordUserIdentifier) % BigInt(avatarPalette.length))
      : Math.floor(Math.random() * avatarPalette.length);
  return avatarPalette[index] ?? avatarPalette[0];
};

/** Normalises a Discord username (or e-mail local part) into the `@handle` shown in the app. */
export const toHandle = (source: string): string => source.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 32) || "member";
