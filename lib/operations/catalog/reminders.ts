import { z } from "zod";

import { minimumReminderRepeatMinutes, timeOfDaySchema } from "@/lib/validation/schemas";
import { createIssueReminder, deleteIssueReminder } from "@/lib/reminders/actions";
import { listIssueReminders } from "@/lib/reminders/queries";

import { defineOperation } from "../define";
import { identifier, issueReference, requireIssue } from "./shared";

export const reminderOperations = [
  defineOperation({
    name: "reminders.create",
    description: "Schedule a Discord reminder about an issue's due date through a workspace webhook.",
    readOnly: false,
    input: z.object({
      reference: issueReference,
      webhookIdentifier: identifier.describe("A registered Discord webhook, as listed by the workspace webhooks operation"),
      leadMinutes: z
        .number()
        .int()
        .min(0)
        .nullable()
        .default(1_440)
        .describe("Minutes before the deadline the first post goes out; null starts now, which needs a repeat"),
      repeatEveryMinutes: z
        .number()
        .int()
        .min(minimumReminderRepeatMinutes)
        .nullable()
        .default(null)
        .describe(`Minutes between posts until the deadline; null posts once. 1440 is daily, ${minimumReminderRepeatMinutes} the fastest allowed`),
      timeOfDay: timeOfDaySchema.default("18:00").describe("Deadline time on the due date, HH:MM, workspace time zone"),
      message: z
        .string()
        .max(1_500)
        .optional()
        .describe("Custom text; user and role mentions ping, @everyone and @here are posted as plain text"),
    }),
    run: async (input) => {
      const issue = await requireIssue(input.reference);
      await createIssueReminder(issue.identifier, {
        webhookIdentifier: input.webhookIdentifier,
        leadMinutes: input.leadMinutes,
        repeatEveryMinutes: input.repeatEveryMinutes,
        timeOfDay: input.timeOfDay,
        message: input.message ?? "",
      });
      return listIssueReminders(issue.identifier);
    },
  }),
  defineOperation({
    name: "reminders.delete",
    description: "Delete a reminder.",
    readOnly: false,
    input: z.object({ identifier }),
    run: async (input) => {
      await deleteIssueReminder(input.identifier);
      return { ok: true };
    },
  }),
];
