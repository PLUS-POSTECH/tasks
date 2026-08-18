/**
 * URL-safe slug from a display name. Names made entirely of characters that
 * do not survive (e.g. Hangul or emoji) fall back to `fallback`.
 */
export const slugify = (name: string, fallback: string, maxLength = 60): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, maxLength)
    .replace(/-+$/, "") || fallback;
