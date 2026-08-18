"use client";

import Link from "next/link";
import { useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Popover } from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast-provider";
import { deleteIssueReminder, sendIssueReminderNow } from "@/lib/reminders/actions";
import type { DiscordWebhookSummary, IssueReminderSummary } from "@/lib/reminders/queries";
import { describeReminderCadence } from "@/lib/reminders/schedule";

import { ReminderForm } from "./reminder-form";
import { ReminderStatus } from "./reminder-status";

type RemindersSectionProps = {
  readonly issueIdentifier: string;
  /** Reminders only fire once the issue has a due date to count from. */
  readonly hasDueDate: boolean;
  readonly reminders: readonly IssueReminderSummary[];
  readonly webhooks: readonly DiscordWebhookSummary[];
};

export const RemindersSection = ({ issueIdentifier, hasDueDate, reminders, webhooks }: RemindersSectionProps) => {
  const [, startTransition] = useTransition();
  const { showToast } = useToast();

  return (
    <section className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-foreground-tertiary">Discord reminders</h2>
        {webhooks.length > 0 ? (
          <Popover
            align="end"
            trigger={
              <IconButton size="compact" tone="muted" aria-label="Add reminder">
                <Icon name="plus" size={13} />
              </IconButton>
            }
          >
            {(close) => (
              <ReminderForm
                issueIdentifier={issueIdentifier}
                webhooks={webhooks}
                hasDueDate={hasDueDate}
                onDone={close}
              />
            )}
          </Popover>
        ) : null}
      </div>
      {webhooks.length === 0 ? (
        <p className="text-xs text-foreground-quaternary">
          No Discord webhooks yet.{" "}
          <Link href="/settings" className="text-accent hover:underline">
            Add one in settings
          </Link>
          .
        </p>
      ) : reminders.length === 0 ? (
        <p className="text-xs text-foreground-quaternary">
          {hasDueDate ? "No reminders yet." : "Set a due date, then add reminders."}
        </p>
      ) : (
        reminders.map((reminder) => (
          <div key={reminder.identifier} className="group/reminder flex items-start gap-1 rounded-md px-1.5 py-1 hover:bg-background-tertiary">
            <Icon name="bell" size={14} className="mt-0.5 shrink-0 text-foreground-tertiary" />
            <div className="min-w-0 flex-1 text-xs">
              <div className="text-[13px] text-foreground-secondary">
                {describeReminderCadence(reminder)} · {reminder.timeOfDay}
              </div>
              <div className="truncate text-foreground-tertiary">
                → {reminder.webhook.name}
                {reminder.message ? ` · “${reminder.message}”` : ""}
              </div>
              <div className="text-foreground-quaternary">
                <ReminderStatus
                  nextRunAt={reminder.nextRunAt}
                  lastSentAt={reminder.lastSentAt}
                  lastError={reminder.lastError}
                />
              </div>
            </div>
            <div className="flex shrink-0 items-center md:opacity-0 md:group-hover/reminder:opacity-100">
              <button
                type="button"
                aria-label="Send now"
                title="Send now"
                onClick={() =>
                  startTransition(async () => {
                    const result = await sendIssueReminderNow(reminder.identifier);
                    if (result.ok) {
                      showToast({ title: "Reminder sent", tone: "success" });
                    } else {
                      showToast({ title: "Failed to send", description: result.error, tone: "danger" });
                    }
                  })
                }
                className="rounded p-1 text-foreground-quaternary hover:bg-background-quaternary hover:text-foreground"
              >
                <Icon name="send" size={12} />
              </button>
              <button
                type="button"
                aria-label="Delete reminder"
                onClick={() => startTransition(() => deleteIssueReminder(reminder.identifier))}
                className="rounded p-1 text-foreground-quaternary hover:bg-background-quaternary hover:text-foreground"
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          </div>
        ))
      )}
    </section>
  );
};
