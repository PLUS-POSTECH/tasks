"use client";

import { useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { archiveNotification, markNotificationRead, unarchiveNotification } from "@/lib/notifications/actions";

type NotificationActionsProps = {
  readonly notificationIdentifier: string;
  readonly unread: boolean;
  readonly archived: boolean;
};

export const NotificationActions = ({ notificationIdentifier, unread, archived }: NotificationActionsProps) => {
  const [, startTransition] = useTransition();
  return (
    <span className="flex shrink-0 items-center gap-0.5 transition-opacity md:opacity-0 md:group-hover/notification:opacity-100">
      <IconButton
        size="inline"
        tone="muted"
        onClick={(event) => {
          event.stopPropagation();
          startTransition(() => markNotificationRead(notificationIdentifier, unread));
        }}
        aria-label={unread ? "Mark as read" : "Mark as unread"}
        title={unread ? "Mark as read" : "Mark as unread"}
      >
        <Icon name={unread ? "mail-open" : "bell"} size={13} />
      </IconButton>
      <IconButton
        size="inline"
        tone="muted"
        onClick={(event) => {
          event.stopPropagation();
          startTransition(() => (archived ? unarchiveNotification(notificationIdentifier) : archiveNotification(notificationIdentifier)));
        }}
        aria-label={archived ? "Unarchive" : "Archive"}
        title={archived ? "Unarchive" : "Archive"}
      >
        <Icon name="archive" size={13} />
      </IconButton>
    </span>
  );
};
