"use server";

import { and, eq, isNull } from "drizzle-orm";

import { getDatabase } from "@/lib/database/client";
import { notifications } from "@/lib/database/schema";
import { action } from "@/lib/session/action";
import type { CurrentUser } from "@/lib/session/current-user";
import { revalidateEverything } from "@/lib/utilities/revalidate";
import { identifierSchema } from "@/lib/validation/schemas";

/** Notifications are addressed to one member, so every write is scoped to the actor's own. */
const ownNotification = (actor: CurrentUser, identifier: string) =>
  and(eq(notifications.identifier, identifierSchema.parse(identifier)), eq(notifications.userIdentifier, actor.identifier));

export const markNotificationRead = action(async (actor, identifier: string, read: boolean = true): Promise<void> => {
  const database = await getDatabase();
  await database
    .update(notifications)
    .set({ readAt: read ? new Date() : null })
    .where(ownNotification(actor, identifier));
  revalidateEverything();
});

/**
 * Archiving a notification also reads it: there is no way to open one from the
 * archived tab, and one rule for a single row and for the whole inbox.
 */
const archivedNotificationPatch = (): { readonly archivedAt: Date; readonly readAt: Date } => {
  const now = new Date();
  return { archivedAt: now, readAt: now };
};

export const archiveNotification = action(async (actor, identifier: string): Promise<void> => {
  const database = await getDatabase();
  await database
    .update(notifications)
    .set(archivedNotificationPatch())
    .where(ownNotification(actor, identifier));
  revalidateEverything();
});

export const unarchiveNotification = action(async (actor, identifier: string): Promise<void> => {
  const database = await getDatabase();
  await database
    .update(notifications)
    .set({ archivedAt: null })
    .where(ownNotification(actor, identifier));
  revalidateEverything();
});

export const markAllNotificationsRead = action(async (actor): Promise<void> => {
  const database = await getDatabase();
  await database
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userIdentifier, actor.identifier), isNull(notifications.readAt)));
  revalidateEverything();
});

/** "Archive all" clears the inbox, unread rows included; they are read on the way out. */
export const archiveAllReadNotifications = action(async (actor): Promise<void> => {
  const database = await getDatabase();
  await database
    .update(notifications)
    .set(archivedNotificationPatch())
    .where(and(eq(notifications.userIdentifier, actor.identifier), isNull(notifications.archivedAt)));
  revalidateEverything();
});
