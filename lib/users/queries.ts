import { asc, isNull } from "drizzle-orm";
import { cache } from "react";

import { getAdminPolicy, adminReasonOf, type AdminReason } from "@/lib/auth/admin";
import { getDatabase } from "@/lib/database/client";
import { users } from "@/lib/database/schema";
import { isPlaceholderEmail } from "@/lib/discord/placeholder-email";
import { findCurrentUser } from "@/lib/session/current-user";

import { toUserSummary, userSummaryColumns } from "./summary";
import type { UserSummary } from "./types";

/** Members who can be assigned things: everyone still in the Discord server. */
export const listMembers = cache(async (): Promise<readonly UserSummary[]> => {
  const database = await getDatabase();
  const rows = await database.query.users.findMany({
    where: isNull(users.leftGuildAt),
    orderBy: [asc(users.name)],
    columns: userSummaryColumns,
  });
  return rows.map(toUserSummary);
});

/**
 * The e-mail address and the reason someone is an admin are administration, not
 * the roster: the page is readable by every member, so those two are absent —
 * not blanked, not hidden in the browser — unless an admin is reading.
 */
export type MemberListItem = UserSummary & {
  readonly isAdmin: boolean;
  /** Created or matched by the Discord sync, so it comes and goes with the server. */
  readonly followsDiscord: boolean;
} & (
    | {
        readonly administered: true;
        /** Null until the person has signed in; synced members start without one. */
        readonly email: string | null;
        /** Why they are an admin, so the members page can say whether it is editable here. */
        readonly adminReason: AdminReason;
      }
    | { readonly administered: false }
  );

/** Everyone the workspace knows, including people who left the Discord server. */
export const listAllMembers = cache(async (): Promise<readonly MemberListItem[]> => {
  const [database, policy, viewer] = await Promise.all([getDatabase(), getAdminPolicy(), findCurrentUser()]);
  const rows = await database.query.users.findMany({ orderBy: [asc(users.name)] });
  return rows.map((row) => {
    const adminReason = adminReasonOf(row, policy);
    const member = {
      ...toUserSummary(row),
      isAdmin: adminReason !== null,
      followsDiscord: row.discordUserIdentifier !== null,
    };
    return viewer?.isAdmin
      ? {
          ...member,
          administered: true,
          email: isPlaceholderEmail(row.email) ? null : row.email,
          adminReason,
        }
      : { ...member, administered: false };
  });
});
