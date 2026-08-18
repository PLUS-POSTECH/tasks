import { AdminRolesManager } from "@/components/settings/admin-roles-manager";
import { MembersManager } from "@/components/settings/members-manager";
import { getAdminPolicy } from "@/lib/auth/admin";
import { discordBotOf, getAuthSettings } from "@/lib/auth/settings";
import { listDiscordRoles } from "@/lib/discord/roles";
import { getCurrentUser } from "@/lib/session/current-user";
import { listAllMembers } from "@/lib/users/queries";
import { getDiscordSyncHealth } from "@/lib/workspace/queries";

export const metadata = { title: "Members" };

export default async function MembersSettingsPage() {
  const [currentUser, members, authSettings, policy, discordRoles, syncHealth] = await Promise.all([
    getCurrentUser(),
    listAllMembers(),
    getAuthSettings(),
    getAdminPolicy(),
    listDiscordRoles(),
    getDiscordSyncHealth(),
  ]);
  const owner = members.find((member) => member.administered && member.adminReason === "owner");
  const mirrorsDiscord = discordBotOf(authSettings) !== null;
  return (
    <>
      <h1 className="text-xl font-semibold text-foreground">Members</h1>
      <MembersManager
        currentUserIdentifier={currentUser.identifier}
        canSync={mirrorsDiscord}
        syncHealth={mirrorsDiscord ? syncHealth : null}
        canManage={currentUser.isAdmin}
        members={members}
      />
      <AdminRolesManager
        selected={policy.adminRoleIdentifiers}
        discordRoles={discordRoles}
        administratorRoleIdentifiers={policy.discordAdministratorRoleIdentifiers}
        ownerName={owner?.name ?? null}
        canManage={currentUser.isAdmin}
      />
    </>
  );
}
