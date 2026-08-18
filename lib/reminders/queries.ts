import { asc, count, eq } from "drizzle-orm";
import { cache } from "react";

import { getDatabase } from "@/lib/database/client";
import { discordWebhooks, issueReminders } from "@/lib/database/schema";

import type { ReminderCadence } from "./schedule";

export type DiscordWebhookSummary = {
  readonly identifier: string;
  readonly name: string;
  /** Host and webhook id only; the token part is never sent to the browser. */
  readonly maskedUrl: string;
  /** Reminders that would go with it, so deleting one can say what it costs. */
  readonly reminderCount: number;
  readonly createdAt: Date;
};

export type IssueReminderSummary = ReminderCadence & {
  readonly identifier: string;
  readonly timeOfDay: string;
  readonly message: string | null;
  readonly webhook: { readonly identifier: string; readonly name: string };
  readonly nextRunAt: Date | null;
  readonly lastSentAt: Date | null;
  readonly lastError: string | null;
};

const maskWebhookUrl = (url: string): string => url.replace(/(\/api\/webhooks\/\d+)\/.+$/, "$1/…");

export const listDiscordWebhooks = cache(async (): Promise<readonly DiscordWebhookSummary[]> => {
  const database = await getDatabase();
  // Counted on its own rather than as a correlated subquery in `extras`: a
  // relational query with no `with` clause renders the outer table's columns
  // unqualified, and the subquery then silently counts zero for every row.
  const [rows, counts] = await Promise.all([
    database.query.discordWebhooks.findMany({ orderBy: [asc(discordWebhooks.name)] }),
    database
      .select({ webhookIdentifier: issueReminders.webhookIdentifier, reminders: count() })
      .from(issueReminders)
      .groupBy(issueReminders.webhookIdentifier),
  ]);
  const reminderCounts = new Map(counts.map((row) => [row.webhookIdentifier, row.reminders]));
  return rows.map((row) => ({
    identifier: row.identifier,
    name: row.name,
    maskedUrl: maskWebhookUrl(row.url),
    reminderCount: reminderCounts.get(row.identifier) ?? 0,
    createdAt: row.createdAt,
  }));
});

export const listIssueReminders = cache(async (issueIdentifier: string): Promise<readonly IssueReminderSummary[]> => {
  const database = await getDatabase();
  const rows = await database.query.issueReminders.findMany({
    where: eq(issueReminders.issueIdentifier, issueIdentifier),
    orderBy: [asc(issueReminders.createdAt)],
    with: { webhook: { columns: { identifier: true, name: true } } },
  });
  return rows.map((row) => ({
    identifier: row.identifier,
    leadMinutes: row.leadMinutes,
    repeatEveryMinutes: row.repeatEveryMinutes,
    timeOfDay: row.timeOfDay,
    message: row.message,
    webhook: row.webhook,
    nextRunAt: row.nextRunAt,
    lastSentAt: row.lastSentAt,
    lastError: row.lastError,
  }));
});
