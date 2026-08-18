"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import { publicAction } from "./action";
import { themeCookieName, themePreferences } from "./theme";

const oneYearInSeconds = 60 * 60 * 24 * 365;

/** Public: the login page carries the same theme toggle as the rest of the app. */
export const setThemePreference = publicAction(async (preference: string): Promise<void> => {
  const parsedPreference = z.enum(themePreferences).parse(preference);
  const cookieStore = await cookies();
  cookieStore.set(themeCookieName, parsedPreference, {
    path: "/",
    maxAge: oneYearInSeconds,
    sameSite: "lax",
  });
});
