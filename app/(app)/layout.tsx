import { readThemePreference } from "@/app/theme-preference";
import { CommandPaletteProvider } from "@/components/command-palette/command-palette-provider";
import { CreateIssueDialogProvider } from "@/components/issues/create-issue/create-issue-dialog-provider";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { MobileTopBar } from "@/components/layout/mobile-top-bar";
import { Sidebar } from "@/components/layout/sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { ToastProvider } from "@/components/ui/toast-provider";
import { WorkspaceDataProvider } from "@/components/workspace/workspace-data-provider";
import { getCurrentUser } from "@/lib/session/current-user";
import { countUnreadNotifications } from "@/lib/notifications/queries";
import { listProjectSummaries } from "@/lib/projects/queries";
import { getWorkspace } from "@/lib/workspace/queries";
import { listLabels } from "@/lib/labels/queries";
import { listStates } from "@/lib/workflow/queries";
import { listMembers } from "@/lib/users/queries";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const currentUser = await getCurrentUser();
  const themePreference = await readThemePreference();

  const [workspace, members, labels, projects, states, unreadCount] = await Promise.all([
    getWorkspace(),
    listMembers(),
    listLabels(),
    listProjectSummaries(),
    listStates(),
    countUnreadNotifications(currentUser.identifier),
  ]);

  return (
    <ToastProvider>
      <WorkspaceDataProvider
        value={{
          currentUser,
          timeZone: workspace.timezone,
          members,
          labels,
          projects,
          states,
        }}
      >
        <CreateIssueDialogProvider>
          <CommandPaletteProvider>
            <SidebarProvider>
              <div className="flex h-full min-h-0 flex-1 flex-col md:flex-row">
                <MobileTopBar workspace={workspace} />
                <Sidebar
                  workspace={workspace}
                  unreadCount={unreadCount}
                  themePreference={themePreference}
                />
                <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
                  {children}
                </main>
              </div>
            </SidebarProvider>
            <KeyboardShortcuts />
          </CommandPaletteProvider>
        </CreateIssueDialogProvider>
      </WorkspaceDataProvider>
    </ToastProvider>
  );
}
