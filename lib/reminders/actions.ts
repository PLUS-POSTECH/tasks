"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDatabase } from "@/lib/database/client";
import { discordWebhooks, issueReminders } from "@/lib/database/schema";
import { openIssue } from "@/lib/issues/mutations";
import { openAccessibleRow } from "@/lib/projects/access";
import { action, adminAction } from "@/lib/session/action";
import { attempt, type ActionResult } from "@/lib/utilities/action-result";
import { revalidateEverything } from "@/lib/utilities/revalidate";
import { identifierSchema, minimumReminderRepeatMinutes, timeOfDaySchema } from "@/lib/validation/schemas";
import { getWorkspace } from "@/lib/workspace/queries";

import { discordWebhookUrlSchema, postDiscordWebhook } from "@/lib/discord/webhooks";
import { rescheduleIssueReminders, sendReminderNow } from "./dispatch";


const webhookInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  url: discordWebhookUrlSchema,
});

export type DiscordWebhookInput = z.input<typeof webhookInputSchema>;

export const createDiscordWebhook = action(async (_actor, rawInput: DiscordWebhookInput): Promise<void> => {
  const input = webhookInputSchema.parse(rawInput);
  const [database, workspace] = await Promise.all([getDatabase(), getWorkspace()]);
  await database.insert(discordWebhooks).values({ workspaceIdentifier: workspace.identifier, ...input });
  revalidateEverything();
});

/**
 * Admin-only, unlike registering one: the reminders that post through a webhook
 * go with it, including reminders on issues the deleter cannot see.
 */
export const deleteDiscordWebhook = adminAction(async (_actor, webhookIdentifier: string): Promise<void> => {
  const parsedIdentifier = identifierSchema.parse(webhookIdentifier);
  const database = await getDatabase();
  await database.delete(discordWebhooks).where(eq(discordWebhooks.identifier, parsedIdentifier));
  revalidateEverything();
});

export const testDiscordWebhook = action(async (actor, webhookIdentifier: string): Promise<ActionResult<void>> => {
  const parsedIdentifier = identifierSchema.parse(webhookIdentifier);
  const database = await getDatabase();
  const webhook = await database.query.discordWebhooks.findFirst({ where: eq(discordWebhooks.identifier, parsedIdentifier) });
  if (!webhook) {
    return { ok: false, error: "Webhook not found." };
  }
  return attempt(
    () =>
      postDiscordWebhook(webhook.url, {
        content: `👋 Test message from Tasks — webhook **${webhook.name}** works. (sent by ${actor.name})`,
      }),
    "Failed to send.",
  );
});

/** A year of minutes: far past any deadline anyone schedules against. */
const maximumCadenceMinutes = 525_600;

const reminderInputSchema = z
  .object({
    webhookIdentifier: identifierSchema,
    /** Null starts the series at once, which only means anything when it repeats. */
    leadMinutes: z.number().int().min(0).max(maximumCadenceMinutes).nullable().default(1_440),
    repeatEveryMinutes: z
      .number()
      .int()
      .min(minimumReminderRepeatMinutes)
      .max(maximumCadenceMinutes)
      .nullable()
      .default(null),
    timeOfDay: timeOfDaySchema,
    message: z
      .string()
      .trim()
      .max(1_500)
      .transform((value) => (value.length === 0 ? null : value)),
  })
  .refine((input) => input.leadMinutes !== null || input.repeatEveryMinutes !== null, {
    error: "A reminder that starts now and never repeats would have nothing to do.",
    path: ["leadMinutes"],
  });

export type IssueReminderInput = z.input<typeof reminderInputSchema>;

export const createIssueReminder = action(async (_actor, issueIdentifier: string, rawInput: IssueReminderInput): Promise<void> => {
  const input = reminderInputSchema.parse(rawInput);
  const { database, currentUser, issue } = await openIssue(issueIdentifier);
  await database.insert(issueReminders).values({
    issueIdentifier: issue.identifier,
    webhookIdentifier: input.webhookIdentifier,
    leadMinutes: input.leadMinutes,
    repeatEveryMinutes: input.repeatEveryMinutes,
    timeOfDay: input.timeOfDay,
    message: input.message,
    createdByIdentifier: currentUser.identifier,
  });
  await rescheduleIssueReminders(database, issue.identifier);
  revalidateEverything();
});

const openReminder = (rawIdentifier: string) =>
  openAccessibleRow(rawIdentifier, {
    load: (database, identifier) =>
      database.query.issueReminders.findFirst({
        where: eq(issueReminders.identifier, identifier),
        columns: { identifier: true, issueIdentifier: true },
      }),
    notFoundMessage: "Reminder not found.",
    assertAccessible: (reminder) => openIssue(reminder.issueIdentifier),
  });

export const deleteIssueReminder = action(async (_actor, reminderIdentifier: string): Promise<void> => {
  const { database, row: reminder } = await openReminder(reminderIdentifier);
  await database.delete(issueReminders).where(eq(issueReminders.identifier, reminder.identifier));
  revalidateEverything();
});

/** Posts the reminder immediately without touching its schedule. */
export const sendIssueReminderNow = action(async (_actor, reminderIdentifier: string): Promise<ActionResult<void>> => {
  const { database, row: reminder } = await openReminder(reminderIdentifier);
  const result = await attempt(() => sendReminderNow(database, reminder.identifier), "Failed to send.");
  revalidateEverything();
  return result;
});
