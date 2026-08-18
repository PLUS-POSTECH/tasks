import { test } from "bun:test";

import { runAsActor } from "@/lib/session/actor-context";

/**
 * Who a test acts as. The actor arrives through the `AsyncLocalStorage` seam
 * `findCurrentUser` reads before the cookie, and no cookie exists here — so a
 * plain `test` runs signed out, which is what the unauthorised cases want.
 */
export const actingAs = <Result>(userIdentifier: string, work: () => Promise<Result>): Promise<Result> =>
  runAsActor({ userIdentifier, via: "system" }, work);

const seededAdminIdentifier = async (): Promise<string> => {
  const { getDatabase } = await import("@/lib/database/client");
  const database = await getDatabase();
  const admin = await database.query.users.findFirst({
    where: (row, { and, eq, isNull }) => and(eq(row.isAdmin, true), isNull(row.leftGuildAt)),
    // The seeded admins share a creation timestamp, so break the tie on the
    // e-mail: an update must not change who "the current user" is.
    orderBy: (row, { asc }) => [asc(row.createdAt), asc(row.email)],
    columns: { id: true },
  });
  if (!admin) {
    throw new Error("No admin user seeded.");
  }
  return admin.id;
};

export const signedInTest = (name: string, body: () => Promise<void>): void => {
  test(name, async () => {
    await actingAs(await seededAdminIdentifier(), body);
  });
};
