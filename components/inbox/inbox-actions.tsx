"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { archiveAllReadNotifications, markAllNotificationsRead } from "@/lib/notifications/actions";

export const InboxActions = () => {
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        variant="ghost"
        size="small"
        disabled={pending}
        leadingIcon={<Icon name="mail-open" size={13} />}
        onClick={() => startTransition(() => markAllNotificationsRead())}
      >
        Mark all read
      </Button>
      <Button
        variant="ghost"
        size="small"
        disabled={pending}
        leadingIcon={<Icon name="archive" size={13} />}
        onClick={() => startTransition(() => archiveAllReadNotifications())}
      >
        Archive all
      </Button>
    </>
  );
};
