import { WorkflowStatesManager } from "@/components/settings/workflow-states-manager";
import { getCurrentUser } from "@/lib/session/current-user";
import { listStatesWithIssueCounts } from "@/lib/workflow/queries";

export const metadata = { title: "Workflow" };

export default async function WorkflowSettingsPage() {
  const [currentUser, states] = await Promise.all([getCurrentUser(), listStatesWithIssueCounts()]);
  return (
    <>
      <h1 className="text-xl font-semibold text-foreground">Workflow</h1>
      <WorkflowStatesManager states={states} canManage={currentUser.isAdmin} />
    </>
  );
}
