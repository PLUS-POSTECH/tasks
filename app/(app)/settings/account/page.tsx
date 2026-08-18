import { ApiTokensManager } from "@/components/settings/api-tokens-manager";
import { ProfileForm } from "@/components/settings/profile-form";
import { listApiTokens } from "@/lib/api-tokens/queries";
import { discordBotOf, getAuthSettings } from "@/lib/auth/settings";
import { getCurrentUser } from "@/lib/session/current-user";

export const metadata = { title: "Account" };

export default async function AccountSettingsPage() {
  const currentUser = await getCurrentUser();
  const [tokens, authSettings] = await Promise.all([listApiTokens(currentUser.identifier), getAuthSettings()]);
  return (
    <>
      <h1 className="text-xl font-semibold text-foreground">Account</h1>
      <ProfileForm user={currentUser} mirrorsDiscord={discordBotOf(authSettings) !== null} />
      <ApiTokensManager tokens={tokens} baseUrl={authSettings.baseUrl ?? ""} />
    </>
  );
}
