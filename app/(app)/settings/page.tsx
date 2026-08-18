import { AuthSettingsForm } from "@/components/settings/auth-settings-form";
import { WebhooksManager } from "@/components/settings/webhooks-manager";
import { WorkspaceForm } from "@/components/settings/workspace-form";
import { discordBotOf, getAuthSettings, toPublicAuthSettings } from "@/lib/auth/settings";
import { listDiscordWebhooks } from "@/lib/reminders/queries";
import { getCurrentUser } from "@/lib/session/current-user";
import { getWorkspace } from "@/lib/workspace/queries";

export const metadata = { title: "Workspace settings" };

export default async function WorkspaceSettingsPage() {
  const [currentUser, workspace, authSettings, webhooks] = await Promise.all([
    getCurrentUser(),
    getWorkspace(),
    getAuthSettings(),
    listDiscordWebhooks(),
  ]);
  return (
    <>
      <h1 className="text-xl font-semibold text-foreground">Workspace</h1>
      <WorkspaceForm workspace={workspace} mirrorsDiscord={discordBotOf(authSettings) !== null} canManage={currentUser.isAdmin} />
      <AuthSettingsForm
        settings={toPublicAuthSettings(authSettings)}
        canManage={currentUser.isAdmin}
        guildFixed={authSettings.discordGuildIdentifier !== null}
      />
      <WebhooksManager webhooks={webhooks} canDelete={currentUser.isAdmin} />
    </>
  );
}
