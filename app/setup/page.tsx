import { redirect } from "next/navigation";

import { AuthSettingsForm } from "@/components/settings/auth-settings-form";
import { getAuthSettings, isAuthConfigured, toPublicAuthSettings } from "@/lib/auth/settings";
import { findCurrentUser } from "@/lib/session/current-user";

export const metadata = { title: "Set up sign-in" };

export default async function SetupPage() {
  const settings = await getAuthSettings();
  if (isAuthConfigured(settings)) {
    const currentUser = await findCurrentUser();
    redirect(currentUser ? "/settings" : "/login");
  }
  return (
    <main className="scrollbar-thin min-h-full flex-1 overflow-y-auto bg-background-secondary px-4 py-10">
      <div className="mx-auto flex max-w-[720px] flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Set up sign-in</h1>
          <p className="mt-1 text-[13px] text-foreground-tertiary">
            Connect a Discord application so members can sign in. These values are stored in the database and can be changed
            later under Settings › Workspace.
          </p>
        </div>
        <AuthSettingsForm settings={toPublicAuthSettings(settings)} title="Discord sign-in" description="" />
        <p className="text-xs text-foreground-quaternary">
          When done, open <a href="/login" className="text-accent hover:underline">/login</a> and sign in. The first person to sign in becomes an admin.
        </p>
      </div>
    </main>
  );
}
