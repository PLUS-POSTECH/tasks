import type { DiscordRole } from "@/lib/discord/api";
import type { ProjectAccessRole } from "@/lib/projects/queries";

export type AccessMenuRole = {
  readonly identifier: string;
  readonly name: string;
} & ({ readonly onServer: true; readonly color: number } | { readonly onServer: false });

/**
 * The server's roles, plus every stored role the server no longer returns:
 * without an entry there is nothing to un-tick, and the restriction goes on
 * standing with nobody left holding the role.
 */
export const accessMenuRoles = (
  accessRoles: readonly ProjectAccessRole[],
  discordRoles: readonly DiscordRole[],
): readonly AccessMenuRole[] => {
  const serverRoleIdentifiers = new Set(discordRoles.map((role) => role.id));
  return [
    ...discordRoles.map((role) => ({ identifier: role.id, name: role.name, onServer: true as const, color: role.color })),
    ...accessRoles
      .filter((role) => !serverRoleIdentifiers.has(role.identifier))
      .map((role) => ({ identifier: role.identifier, name: role.name, onServer: false as const })),
  ];
};
