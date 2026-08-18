import { nameOfActivitySubject } from "@/lib/issues/activity-subject";
import type { UserSummary } from "@/lib/users/types";

export const userSummaryColumns = {
  id: true,
  name: true,
  displayName: true,
  avatarColor: true,
  image: true,
  leftGuildAt: true,
} as const;

type UserSummaryRow = {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly avatarColor: string;
  readonly image?: string | null;
  readonly leftGuildAt?: Date | null;
};

const formerMemberName = "Former member";

export const memberNameColumns = { name: true } as const;

/**
 * Somebody who left the Discord server is still called what they were called;
 * "Former member" is left for the one case with no row to read at all.
 */
export const nameOfMemberRow = (row: { readonly name: string }): string => row.name;

/**
 * Somebody who left the Discord server keeps the name they had; `hasLeft` is
 * what keeps them out of every picker and filter instead. Erasing somebody is
 * the separate, deliberate act of removing the member.
 */
export const toUserSummary = (row: UserSummaryRow): UserSummary => ({
  identifier: row.id,
  name: row.name,
  displayName: row.displayName,
  avatarColor: row.avatarColor,
  image: row.image ?? null,
  ...(row.leftGuildAt ? { hasLeft: true } : {}),
});

export const toOptionalUserSummary = (row: UserSummaryRow | null): UserSummary | null =>
  row ? toUserSummary(row) : null;

/**
 * The name to print for somebody named only by an identifier, resolved against
 * the whole roster rather than the members still here, and "Former member" when
 * nothing names them. `nameAtTheTime` is read only once no row names them.
 */
export const nameOfMember = (
  members: readonly UserSummary[],
  identifier: string | number | null | undefined,
  nameAtTheTime: string | number | null | undefined = null,
): string => nameOfActivitySubject(members, identifier, nameAtTheTime) ?? formerMemberName;
