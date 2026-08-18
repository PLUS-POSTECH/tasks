import { redirect } from "next/navigation";

import { DiscordSignInButton } from "@/components/auth/discord-sign-in-button";
import { WorkspaceBadge } from "@/components/workspace/workspace-badge";
import { getAuthSettings, isAuthConfigured } from "@/lib/auth/settings";
import { findCurrentUser } from "@/lib/session/current-user";
import { getWorkspace } from "@/lib/workspace/queries";

export const metadata = { title: "Sign in" };

const errorMessages: Readonly<Record<string, string>> = {
  unable_to_get_user_info:
    "Sign-in was refused. Only members of the workspace's Discord server can sign in, and Discord must share your email address.",
  access_denied: "You canceled the Discord authorization.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const [currentUser, searchParameters] = await Promise.all([findCurrentUser(), props.searchParams]);
  if (currentUser) {
    redirect("/");
  }
  if (!isAuthConfigured(await getAuthSettings())) {
    redirect("/setup");
  }
  const workspace = await getWorkspace();
  const errorCode = typeof searchParameters.error === "string" ? searchParameters.error : null;
  const errorMessage = errorCode
    ? (errorMessages[errorCode] ?? `Sign-in failed (${errorCode}). Please try again.`)
    : null;

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-background-secondary px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-popover">
        <div className="mb-6 flex items-center gap-3">
          <WorkspaceBadge name={workspace.name} iconUrl={workspace.iconUrl} size={36} className="rounded-lg" />
          <div>
            <h1 className="text-base font-semibold text-foreground">{workspace.name}</h1>
            <p className="text-xs text-foreground-tertiary">Sign in to continue</p>
          </div>
        </div>
        {errorMessage ? (
          <p className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{errorMessage}</p>
        ) : null}
        <DiscordSignInButton />
        <p className="mt-4 text-center text-xs text-foreground-quaternary">
          Access is limited to members of the workspace’s Discord server.
        </p>
      </div>
    </main>
  );
}
