import { cookies } from "next/headers";

import { isThemePreference, themeCookieName, type ThemePreference } from "@/lib/session/theme";

export const readThemePreference = async (): Promise<ThemePreference> => {
  const cookieStore = await cookies();
  const storedTheme = cookieStore.get(themeCookieName)?.value;
  return isThemePreference(storedTheme) ? storedTheme : "system";
};
