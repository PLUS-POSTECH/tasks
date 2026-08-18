"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";

import { markNotificationRead } from "@/lib/notifications/actions";
import { classNames } from "@/lib/utilities/class-names";

type NotificationRowShellProps = {
  readonly notificationIdentifier: string;
  readonly href: string;
  readonly unread: boolean;
  readonly children: ReactNode;
};

export const NotificationRowShell = ({ notificationIdentifier, href, unread, children }: NotificationRowShellProps) => {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <div
      role="row"
      onClick={() => {
        if (unread) {
          startTransition(() => markNotificationRead(notificationIdentifier));
        }
        router.push(href);
      }}
      className={classNames(
        "group/notification flex cursor-default items-start gap-3 border-b border-border-subtle px-3 py-2.5 transition-colors hover:bg-background-secondary sm:px-4",
        unread ? "" : "opacity-70",
      )}
    >
      {children}
    </div>
  );
};
