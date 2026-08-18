import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getAdminPolicy, isWorkspaceAdmin } from "@/lib/auth/admin";
import { getAuth } from "@/lib/auth/server";
import { getDatabase } from "@/lib/database/client";
import { users } from "@/lib/database/schema";

import { toUserSummary } from "@/lib/users/summary";
import type { UserSummary } from "@/lib/users/types";

import { currentActorContext } from "./actor-context";

export type CurrentUser = UserSummary & {
  readonly workspaceIdentifier: string;
  readonly email: string;
  readonly isAdmin: boolean;
};

const toCurrentUser = async (user: typeof users.$inferSelect): Promise<CurrentUser> => ({
  ...toUserSummary(user),
  workspaceIdentifier: user.workspaceIdentifier,
  email: user.email,
  isAdmin: isWorkspaceAdmin(user, await getAdminPolicy()),
});

const sessionUserIdentifier = async (): Promise<string | null> => {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
};

/**
 * Members who left the Discord server keep no access, whichever way they
 * authenticate — and neither does work done on their behalf, which is why this
 * is callable without being them.
 */
export const findMember = async (userIdentifier: string): Promise<CurrentUser | null> => {
  const database = await getDatabase();
  const user = await database.query.users.findFirst({
    where: eq(users.id, userIdentifier),
  });
  if (!user || user.leftGuildAt !== null) {
    return null;
  }
  return toCurrentUser(user);
};

/**
 * An explicit actor context (API token, MCP, background job) wins over the
 * cookie session.
 */
export const findCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const userIdentifier = currentActorContext()?.userIdentifier ?? (await sessionUserIdentifier());
  return userIdentifier ? findMember(userIdentifier) : null;
});

export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const user = await findCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
});
