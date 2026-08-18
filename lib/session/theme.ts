export const themeCookieName = "tasks.theme";

export const themePreferences = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof themePreferences)[number];

export const isThemePreference = (
  value: string | undefined,
): value is ThemePreference =>
  themePreferences.some((preference) => preference === value);

/** Class placed on <html>; `system` uses none so CSS follows the OS scheme. */
export const themeClassName = (preference: ThemePreference): string =>
  preference === "system" ? "" : preference;
