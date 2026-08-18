import { LabelsManager } from "@/components/settings/labels-manager";
import { listLabelsWithIssueCounts } from "@/lib/labels/queries";
import { getCurrentUser } from "@/lib/session/current-user";

export const metadata = { title: "Labels" };

export default async function LabelsSettingsPage() {
  const [currentUser, labels] = await Promise.all([getCurrentUser(), listLabelsWithIssueCounts()]);
  return (
    <>
      <h1 className="text-xl font-semibold text-foreground">Labels</h1>
      <LabelsManager labels={labels} canManage={currentUser.isAdmin} />
    </>
  );
}
