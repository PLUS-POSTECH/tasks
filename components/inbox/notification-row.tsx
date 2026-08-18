import Link from "next/link";

import { StateIcon } from "@/components/issues/state-icon";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Timestamp } from "@/components/ui/timestamp";
import { issuePathForReference } from "@/lib/issues/reference";
import type { NotificationListItem } from "@/lib/notifications/queries";
import { classNames } from "@/lib/utilities/class-names";

import { NotificationActions } from "./notification-actions";
import { NotificationRowShell } from "./notification-row-shell";

type NotificationRowProps = {
  readonly notification: NotificationListItem;
};

const describe = (notification: NotificationListItem): string => {
  const actor = notification.actor?.name ?? "Someone";
  switch (notification.type) {
    case "issue_assigned":
      return `${actor} assigned you`;
    case "issue_commented":
      return `${actor} commented`;
    case "issue_state_changed":
      return `${actor} changed the status`;
  }
};

export const NotificationRow = ({ notification }: NotificationRowProps) => {
  const unread = notification.readAt === null;
  const href = notification.issue ? issuePathForReference(notification.issue.reference) : "/inbox";

  return (
    <NotificationRowShell notificationIdentifier={notification.identifier} href={href} unread={unread}>
      <span className="relative mt-0.5">
        {notification.actor ? (
          <Avatar name={notification.actor.name} color={notification.actor.avatarColor} image={notification.actor.image} size={26} />
        ) : (
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-background-tertiary text-foreground-tertiary">
            <Icon name="bell" size={13} />
          </span>
        )}
        {unread ? <span className="absolute -left-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-background" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2 text-[13px]">
          {notification.issue ? (
            <>
              <StateIcon type={notification.issue.state.type} color={notification.issue.state.color} className="shrink-0" />
              <Link
                href={href}
                className={classNames("min-w-0 truncate", unread ? "font-medium text-foreground" : "text-foreground-secondary")}
              >
                {notification.issue.title}
              </Link>
              <span className="hidden shrink-0 font-mono text-xs text-foreground-quaternary sm:inline">{notification.issue.reference}</span>
            </>
          ) : (
            <span className="text-foreground-secondary">Issue no longer exists</span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-foreground-tertiary">
          {describe(notification)}
          {notification.commentExcerpt ? `: “${notification.commentExcerpt}”` : ""}
        </div>
      </div>
      <Timestamp value={notification.createdAt} format="compact" className="shrink-0 pt-0.5 text-xs text-foreground-quaternary tabular-nums" />
      <NotificationActions notificationIdentifier={notification.identifier} unread={unread} archived={notification.archivedAt !== null} />
    </NotificationRowShell>
  );
};
