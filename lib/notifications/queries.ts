import { and, count, desc, eq, inArray, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import { cache } from "react";

import { getDatabase, type Database } from "@/lib/database/client";
import { issues, notifications, type NotificationType } from "@/lib/database/schema";
import {
  accessibleIssueCondition,
  getProjectAccessContext,
  type ProjectAccessContext,
} from "@/lib/projects/access";
import { formatIssueReference } from "@/lib/issues/reference";
import type { UserSummary } from "@/lib/users/types";
import type { IssueStateSummary } from "@/lib/workflow/types";
import { issueStateSummaryColumns } from "@/lib/workflow/queries";
import { toOptionalUserSummary, userSummaryColumns } from "@/lib/users/summary";

export type NotificationListItem = {
  readonly identifier: string;
  readonly type: NotificationType;
  readonly readAt: Date | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly actor: UserSummary | null;
  readonly issue: {
    readonly identifier: string;
    readonly reference: string;
    readonly title: string;
    readonly state: IssueStateSummary;
  } | null;
  readonly commentExcerpt: string | null;
};

/**
 * Hides notifications about issues in projects the member cannot see. The badge
 * and the inbox are both bounded by it: a count over rows the list refuses to
 * show is a number nobody can clear.
 */
const readableNotificationCondition = (
  database: Database,
  context: ProjectAccessContext | null,
): SQL | undefined => {
  const issueCondition = accessibleIssueCondition(database, context);
  if (issueCondition === undefined) {
    return undefined;
  }
  return or(
    isNull(notifications.issueIdentifier),
    inArray(
      notifications.issueIdentifier,
      database.select({ identifier: issues.identifier }).from(issues).where(issueCondition),
    ),
  );
};

export const countUnreadNotifications = cache(
  async (userIdentifier: string): Promise<number> => {
    const [database, context] = await Promise.all([getDatabase(), getProjectAccessContext()]);
    const [row] = await database
      .select({ total: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userIdentifier, userIdentifier),
          isNull(notifications.readAt),
          isNull(notifications.archivedAt),
          readableNotificationCondition(database, context),
        ),
      );
    return row?.total ?? 0;
  },
);

/**
 * Two disjoint sets of rows rather than one set and a superset of it, so the
 * limit below is not spent on rows the tab would throw away afterwards.
 */
export type NotificationTab = "inbox" | "archived";

export const listNotifications = cache(
  async (userIdentifier: string, tab: NotificationTab): Promise<readonly NotificationListItem[]> => {
    const [database, context] = await Promise.all([getDatabase(), getProjectAccessContext()]);
    const conditions: (SQL | undefined)[] = [
      eq(notifications.userIdentifier, userIdentifier),
      tab === "archived" ? isNotNull(notifications.archivedAt) : isNull(notifications.archivedAt),
      readableNotificationCondition(database, context),
    ];
    const rows = await database.query.notifications.findMany({
      where: and(...conditions),
      orderBy: [desc(notifications.createdAt)],
      limit: 200,
      with: {
        actor: { columns: userSummaryColumns },
        issue: {
          columns: { identifier: true, number: true, title: true },
          with: { state: { columns: issueStateSummaryColumns } },
        },
        comment: { columns: { body: true, deletedAt: true } },
      },
    });
    return rows.map((row) => ({
      identifier: row.identifier,
      type: row.type,
      readAt: row.readAt,
      archivedAt: row.archivedAt,
      createdAt: row.createdAt,
      actor: toOptionalUserSummary(row.actor),
      issue: row.issue
        ? {
            identifier: row.issue.identifier,
            reference: formatIssueReference(row.issue.number),
            title: row.issue.title,
            state: row.issue.state,
          }
        : null,
      // A deleted comment keeps the notification it caused but not its words:
      // a comment kept for its replies would otherwise go on quoting them here
      // after the thread stopped showing them.
      commentExcerpt: row.comment && row.comment.deletedAt === null ? row.comment.body.slice(0, 140) : null,
    }));
  },
);
