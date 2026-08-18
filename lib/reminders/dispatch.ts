import { and, asc, eq, isNotNull, lte, type SQL } from "drizzle-orm";

import { loadAuthSettings } from "@/lib/auth/settings";
import { getDatabase, type Database } from "@/lib/database/client";
import { issueReminders } from "@/lib/database/schema";
import { priorityName } from "@/lib/issues/priority";
import { formatIssueReference, issuePath } from "@/lib/issues/reference";
import { loadWorkspaceRow } from "@/lib/workspace/row";

import { DiscordApiError } from "@/lib/discord/client";
import { discordTimestamp, postDiscordWebhook, type DiscordWebhookMessage } from "@/lib/discord/webhooks";
import { zonedDateTimeToInstant } from "@/lib/formatting/calendar-date";

import { computeNextRunAt, describeReminderCadence } from "./schedule";

const reminderWith = {
  webhook: true,
  issue: {
    with: {
      state: { columns: { name: true, type: true } },
      issueAssignees: { with: { user: { columns: { name: true } } } },
      project: { columns: { name: true } },
    },
  },
} as const;

type ReminderRow = NonNullable<
  Awaited<ReturnType<typeof loadReminder>>
>;

const loadReminder = async (database: Database, identifier: string) =>
  database.query.issueReminders.findFirst({ where: eq(issueReminders.identifier, identifier), with: reminderWith });

const buildReminderMessage = (
  reminder: ReminderRow,
  context: { readonly timeZone: string; readonly baseUrl: string | null },
): DiscordWebhookMessage => {
  const { issue } = reminder;
  const reference = formatIssueReference(issue.number);
  const url = context.baseUrl ? `${context.baseUrl}${issuePath(issue.number)}` : undefined;
  const deadline = issue.dueDate ? zonedDateTimeToInstant(issue.dueDate, reminder.timeOfDay, context.timeZone) : null;
  const dueText = deadline ? `${discordTimestamp(deadline)} (${discordTimestamp(deadline, "R")})` : "No due date";
  const content =
    reminder.message?.trim() ||
    (deadline ? `⏰ **${reference} ${issue.title}** is due ${discordTimestamp(deadline, "R")}.` : `⏰ **${reference} ${issue.title}**`);
  return {
    content,
    embeds: [
      {
        title: `${reference} ${issue.title}`,
        ...(url ? { url } : {}),
        color: 0x5e6ad2,
        fields: [
          { name: "Due", value: dueText, inline: true },
          { name: "Status", value: issue.state.name, inline: true },
          {
            name: "Assignees",
            value: issue.issueAssignees.map((assignment) => assignment.user.name).join(", ") || "Unassigned",
            inline: true,
          },
          { name: "Priority", value: priorityName(issue.priority), inline: true },
          ...(issue.project ? [{ name: "Project", value: issue.project.name, inline: true }] : []),
        ],
      },
    ],
  };
};

/** Resolved once per pass and handed down. */
type ReminderContext = { readonly timeZone: string; readonly baseUrl: string | null };

const loadReminderContext = async (): Promise<ReminderContext> => {
  const [workspace, settings] = await Promise.all([loadWorkspaceRow(), loadAuthSettings()]);
  return { timeZone: workspace.timezone, baseUrl: settings.baseUrl };
};

/** The occurrence the reminder was on is over, so its failure count restarts. */
const rescheduleReminder = async (
  database: Database,
  reminder: ReminderRow,
  after: Date,
  { timeZone }: ReminderContext,
): Promise<void> => {
  await database
    .update(issueReminders)
    .set({
      nextRunAt: computeNextRunAt(
        {
          leadMinutes: reminder.leadMinutes,
          repeatEveryMinutes: reminder.repeatEveryMinutes,
          timeOfDay: reminder.timeOfDay,
          dueDate: reminder.issue.dueDate,
          timeZone,
        },
        after,
      ),
      failedAttempts: 0,
      updatedAt: new Date(),
    })
    .where(eq(issueReminders.identifier, reminder.identifier));
};

const rescheduleReminders = async (database: Database, where?: SQL): Promise<void> => {
  const [reminders, context] = await Promise.all([
    database.query.issueReminders.findMany({ where, with: reminderWith }),
    loadReminderContext(),
  ]);
  const now = new Date();
  for (const reminder of reminders) {
    await rescheduleReminder(database, reminder, now, context);
  }
};

export const rescheduleIssueReminders = async (database: Database, issueIdentifier: string): Promise<void> =>
  rescheduleReminders(database, eq(issueReminders.issueIdentifier, issueIdentifier));

export const rescheduleAllReminders = async (database: Database): Promise<void> =>
  rescheduleReminders(database);

const isIssueOpen = (issue: ReminderRow["issue"]): boolean =>
  issue.state.type !== "completed" && issue.state.type !== "canceled";

const postReminder = async (database: Database, reminder: ReminderRow, context: ReminderContext): Promise<void> => {
  const now = new Date();
  try {
    await postDiscordWebhook(reminder.webhook.url, buildReminderMessage(reminder, context));
    console.info(
      `[reminders] Sent reminder for ${formatIssueReference(reminder.issue.number)} to ${reminder.webhook.name} (${describeReminderCadence(reminder).toLowerCase()}).`,
    );
    await database
      .update(issueReminders)
      .set({ lastSentAt: now, lastError: null, updatedAt: now })
      .where(eq(issueReminders.identifier, reminder.identifier));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[reminders] Failed to send reminder ${reminder.identifier}: ${message}`);
    await database
      .update(issueReminders)
      .set({ lastError: message.slice(0, 500), updatedAt: now })
      .where(eq(issueReminders.identifier, reminder.identifier));
    throw error;
  }
};

/** How long a claimed reminder is held before another pass may take it back. */
const claimLeaseMilliseconds = 5 * 60_000;

/** Wait before retrying a refused delivery; it doubles with each attempt. */
const retryDelayMilliseconds = 60_000;

/** The longest a retry is ever put off, including one Discord asked for. */
const maximumRetryDelayMilliseconds = 15 * 60_000;

/** Attempts one occurrence gets before the schedule moves past it. */
const maximumDeliveryAttempts = 5;

const retryDelayAfter = (attempts: number, failure: unknown): number => {
  const requested = failure instanceof DiscordApiError ? failure.retryAfterMilliseconds : null;
  const delay = requested ?? retryDelayMilliseconds * 2 ** (attempts - 1);
  return Math.min(Math.max(delay, 0), maximumRetryDelayMilliseconds);
};

/**
 * Claims one due reminder by moving `nextRunAt` to a lease rather than
 * clearing it, so a pass that dies leaves it pending rather than looking sent.
 * False when another dispatcher claimed it first.
 */
const claimDueReminder = async (
  database: Database,
  identifier: string,
  due: Date,
  claimedAt: Date,
): Promise<boolean> => {
  const claimed = await database
    .update(issueReminders)
    .set({ nextRunAt: new Date(claimedAt.getTime() + claimLeaseMilliseconds), updatedAt: claimedAt })
    .where(
      and(
        eq(issueReminders.identifier, identifier),
        isNotNull(issueReminders.nextRunAt),
        lte(issueReminders.nextRunAt, due),
      ),
    )
    .returning({ identifier: issueReminders.identifier });
  return claimed.length === 1;
};

/**
 * A 404 stops the reminder outright rather than costing it attempts: the
 * webhook is gone from Discord, and waiting does not bring it back.
 */
const scheduleRetry = async (
  database: Database,
  reminder: ReminderRow,
  failure: unknown,
  attemptedAt: Date,
  context: ReminderContext,
): Promise<void> => {
  if (failure instanceof DiscordApiError && failure.status === 404) {
    console.warn(
      `[reminders] Stopping reminder ${reminder.identifier}: Discord no longer has the webhook ${reminder.webhook.name}. Point the reminder at another webhook, or delete it.`,
    );
    await database
      .update(issueReminders)
      .set({ nextRunAt: null, failedAttempts: 0, updatedAt: attemptedAt })
      .where(eq(issueReminders.identifier, reminder.identifier));
    return;
  }
  const attempts = reminder.failedAttempts + 1;
  if (attempts >= maximumDeliveryAttempts) {
    console.warn(
      `[reminders] Giving up on reminder ${reminder.identifier} after ${attempts} refused deliveries; moving on to its next occurrence.`,
    );
    await rescheduleReminder(database, reminder, attemptedAt, context);
    return;
  }
  const delay = retryDelayAfter(attempts, failure);
  await database
    .update(issueReminders)
    .set({
      nextRunAt: new Date(attemptedAt.getTime() + delay),
      failedAttempts: attempts,
      updatedAt: attemptedAt,
    })
    .where(eq(issueReminders.identifier, reminder.identifier));
  console.warn(
    `[reminders] Retrying reminder ${reminder.identifier} in ${Math.round(delay / 1000)}s (attempt ${attempts} of ${maximumDeliveryAttempts}).`,
  );
};

/**
 * The post comes before the schedule moves: advancing first would consume the
 * occurrence whatever Discord answered, and the default cadence has only one.
 * Who created the reminder is deliberately not consulted; it belongs to the
 * issue, and their access says nothing about who reads the channel.
 */
const deliverDueReminder = async (
  database: Database,
  identifier: string,
  attemptedAt: Date,
  context: ReminderContext,
): Promise<void> => {
  const reminder = await loadReminder(database, identifier);
  if (!reminder) {
    return;
  }
  if (!isIssueOpen(reminder.issue)) {
    await rescheduleReminder(database, reminder, attemptedAt, context);
    return;
  }
  try {
    await postReminder(database, reminder, context);
  } catch (error) {
    await scheduleRetry(database, reminder, error, attemptedAt, context);
    return;
  }
  await rescheduleReminder(database, reminder, attemptedAt, context);
};

export const sendReminderNow = async (database: Database, identifier: string): Promise<void> => {
  const reminder = await loadReminder(database, identifier);
  if (!reminder) {
    throw new Error("Reminder not found.");
  }
  await postReminder(database, reminder, await loadReminderContext());
};

/**
 * Each reminder is claimed on its own immediately before it is delivered, so
 * an overlapping pass sends nothing and a pass that stops part-way leaves the
 * reminders it never reached as due as it found them.
 */
export const dispatchDueReminders = async (now = new Date()): Promise<number> => {
  const database = await getDatabase();
  const due = await database.query.issueReminders.findMany({
    where: and(isNotNull(issueReminders.nextRunAt), lte(issueReminders.nextRunAt, now)),
    orderBy: [asc(issueReminders.nextRunAt)],
    columns: { identifier: true },
  });
  if (due.length === 0) {
    return 0;
  }
  const context = await loadReminderContext();
  let claimedCount = 0;
  for (const { identifier } of due) {
    const attemptedAt = new Date();
    if (!(await claimDueReminder(database, identifier, now, attemptedAt))) {
      continue;
    }
    claimedCount += 1;
    try {
      await deliverDueReminder(database, identifier, attemptedAt, context);
    } catch (error) {
      // One reminder's failure must not stop the pass: it keeps its lease and
      // comes back on its own.
      console.warn(`[reminders] Could not handle reminder ${identifier}; it stays claimed until its lease expires.`, error);
    }
  }
  return claimedCount;
};
