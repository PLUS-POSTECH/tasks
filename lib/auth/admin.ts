import { isNull } from "drizzle-orm";
import { cache } from "react";

import type { DiscordRole } from "@/lib/discord/api";
import { getDatabase } from "@/lib/database/client";
import { users } from "@/lib/database/schema";
import { getWorkspaceRow, loadWorkspaceRow, type WorkspaceRow } from "@/lib/workspace/row";

/**
 * Discord's ADMINISTRATOR bit (1 << 3). The permission field arrives as a
 * decimal string because the bitfield is wider than a JavaScript number, so it
 * is compared as a bigint, written with the constructor because the tsconfig
 * target predates bigint literals.
 */
const administratorPermission = BigInt(8);
const noPermissions = BigInt(0);

export const grantsAdministrator = (role: DiscordRole): boolean => {
  try {
    return (BigInt(role.permissions) & administratorPermission) !== noPermissions;
  } catch {
    return false;
  }
};

export type AdminPolicy = {
  readonly adminRoleIdentifiers: readonly string[];
  /** Roles that carry Administrator on the server itself. */
  readonly discordAdministratorRoleIdentifiers: readonly string[];
  readonly discordOwnerIdentifier: string | null;
};

export type AdminCandidate = {
  /** Granted here, from the members page. */
  readonly isAdmin: boolean;
  readonly discordUserIdentifier: string | null;
  readonly discordRoleIdentifiers: readonly string[];
};

/**
 * A grant made here is kept as a fourth reason alongside the three Discord
 * gives, so a deployment whose bot is not configured yet can still have an admin.
 */
export type AdminReason = "owner" | "administrator_role" | "admin_role" | "granted" | null;

export const adminReasonOf = (candidate: AdminCandidate, policy: AdminPolicy): AdminReason => {
  if (policy.discordOwnerIdentifier !== null && candidate.discordUserIdentifier === policy.discordOwnerIdentifier) {
    return "owner";
  }
  const holds = (identifiers: readonly string[]) =>
    candidate.discordRoleIdentifiers.some((identifier) => identifiers.includes(identifier));
  if (holds(policy.discordAdministratorRoleIdentifiers)) {
    return "administrator_role";
  }
  if (holds(policy.adminRoleIdentifiers)) {
    return "admin_role";
  }
  return candidate.isAdmin ? "granted" : null;
};

export const isWorkspaceAdmin = (candidate: AdminCandidate, policy: AdminPolicy): boolean =>
  adminReasonOf(candidate, policy) !== null;

const adminPolicyOf = (workspace: WorkspaceRow): AdminPolicy => ({
  adminRoleIdentifiers: workspace.adminRoleIdentifiers,
  discordAdministratorRoleIdentifiers: workspace.discordAdministratorRoleIdentifiers,
  discordOwnerIdentifier: workspace.discordOwnerIdentifier,
});

/** Reads the row afresh, for callers that have just changed who is an admin. */
export const loadAdminPolicy = async (): Promise<AdminPolicy> => adminPolicyOf(await loadWorkspaceRow());

/** The same policy for a request that is only reading, over one shared row read. */
export const getAdminPolicy = cache(async (): Promise<AdminPolicy> => adminPolicyOf(await getWorkspaceRow()));

/**
 * A deployment where nobody is an admin must stay open at `/setup` or it can
 * never be corrected, so members who left the Discord server are not counted:
 * somebody who can no longer sign in cannot administer the deployment.
 */
export const hasAnyAdmin = async (): Promise<boolean> => {
  const [database, policy] = await Promise.all([getDatabase(), loadAdminPolicy()]);
  const candidates = await database.query.users.findMany({
    where: isNull(users.leftGuildAt),
    columns: { isAdmin: true, discordUserIdentifier: true, discordRoleIdentifiers: true },
  });
  return candidates.some((candidate) => isWorkspaceAdmin(candidate, policy));
};
