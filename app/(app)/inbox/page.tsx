import { InboxActions } from "@/components/inbox/inbox-actions";
import { NotificationRow } from "@/components/inbox/notification-row";
import { PageHeader } from "@/components/layout/page-header";
import { TabLink } from "@/components/layout/tab-link";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listNotifications } from "@/lib/notifications/queries";
import { getCurrentUser } from "@/lib/session/current-user";

export const metadata = { title: "Inbox" };

export default async function InboxPage(props: PageProps<"/inbox">) {
  const searchParameters = await props.searchParams;
  const tab = searchParameters.tab === "archived" ? "archived" : "inbox";
  const currentUser = await getCurrentUser();
  const notifications = await listNotifications(currentUser.identifier, tab);

  return (
    <>
      <PageHeader
        title="Inbox"
        icon={<Icon name="inbox" size={15} />}
        tabs={
          <>
            <TabLink href="/inbox" exact>Notifications</TabLink>
            <TabLink href="/inbox?tab=archived" exact>Archived</TabLink>
          </>
        }
        actions={tab === "inbox" ? <InboxActions /> : null}
      />
      <ScrollArea>
        {notifications.length === 0 ? (
          <EmptyState
            icon={<Icon name="inbox" size={18} />}
            title={tab === "archived" ? "Nothing archived" : "You're all caught up"}
            description="Assignments, comments, and status changes on issues you follow show up here."
          />
        ) : (
          <div role="grid">
            {notifications.map((notification) => (
              <NotificationRow key={notification.identifier} notification={notification} />
            ))}
          </div>
        )}
      </ScrollArea>
    </>
  );
}
