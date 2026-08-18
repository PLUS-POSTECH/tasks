"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { reminderLeadChoices, reminderRepeatChoices } from "@/lib/reminders/cadence-choices";
import { createIssueReminder } from "@/lib/reminders/actions";
import type { DiscordWebhookSummary } from "@/lib/reminders/queries";
import { describeReminderCadence } from "@/lib/reminders/schedule";

const selectClassName =
  "h-8 w-full rounded-md border border-border bg-background px-2 text-[13px] text-foreground outline-none focus:border-accent";

type ReminderFormProps = {
  readonly issueIdentifier: string;
  readonly webhooks: readonly DiscordWebhookSummary[];
  readonly hasDueDate: boolean;
  readonly onDone: () => void;
};

/** null (“from now on”, “don't repeat”) is a real choice, not an absent one. */
const toMinutes = (value: string): number | null => (value === "" ? null : Number(value));
const toValue = (minutes: number | null): string => (minutes === null ? "" : String(minutes));

export const ReminderForm = ({ issueIdentifier, webhooks, hasDueDate, onDone }: ReminderFormProps) => {
  const [webhookIdentifier, setWebhookIdentifier] = useState(webhooks[0]?.identifier ?? "");
  const [leadMinutes, setLeadMinutes] = useState<number | null>(1_440);
  const [repeatEveryMinutes, setRepeatEveryMinutes] = useState<number | null>(null);
  const [timeOfDay, setTimeOfDay] = useState("18:00");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex w-[300px] flex-col gap-2 p-3 text-[13px]"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          try {
            await createIssueReminder(issueIdentifier, { webhookIdentifier, leadMinutes, repeatEveryMinutes, timeOfDay, message });
            onDone();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Failed to add reminder.");
          }
        });
      }}
    >
      {!hasDueDate ? (
        <p className="rounded-md bg-warning/10 px-2 py-1 text-xs text-warning">
          This issue has no due date; the reminder stays idle until one is set.
        </p>
      ) : null}
      <label className="flex flex-col gap-1 text-xs text-foreground-tertiary">
        Webhook
        <select value={webhookIdentifier} onChange={(event) => setWebhookIdentifier(event.target.value)} className={selectClassName}>
          {webhooks.map((webhook) => (
            <option key={webhook.identifier} value={webhook.identifier}>
              {webhook.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-foreground-tertiary">
        First post
        <select value={toValue(leadMinutes)} onChange={(event) => setLeadMinutes(toMinutes(event.target.value))} className={selectClassName}>
          {reminderLeadChoices.map((choice) => (
            <option key={choice.label} value={toValue(choice.minutes)}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-foreground-tertiary">
        Repeat until due
        <select
          value={toValue(repeatEveryMinutes)}
          onChange={(event) => setRepeatEveryMinutes(toMinutes(event.target.value))}
          className={selectClassName}
        >
          {reminderRepeatChoices.map((choice) => (
            <option key={choice.label} value={toValue(choice.minutes)}>
              {choice.label}
            </option>
          ))}
        </select>
        <span className="text-foreground-quaternary">{describeReminderCadence({ leadMinutes, repeatEveryMinutes })}.</span>
      </label>
      <label className="flex flex-col gap-1 text-xs text-foreground-tertiary">
        Deadline time on the due date
        <TextInput type="time" value={timeOfDay} onChange={(event) => setTimeOfDay(event.target.value)} required />
      </label>
      <label className="flex flex-col gap-1 text-xs text-foreground-tertiary">
        Message (optional)
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          placeholder="Defaults to “⏰ #12 Title is due in 1 day”. Mentions like <@&roleId> ping; @everyone and @here do not."
          className="scrollbar-thin resize-y rounded-md border border-border bg-background px-2 py-1.5 text-[13px] text-foreground outline-none placeholder:text-foreground-quaternary focus:border-accent"
        />
      </label>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="small" type="button" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="small"
          type="submit"
          disabled={pending || !webhookIdentifier || (leadMinutes === null && repeatEveryMinutes === null)}
        >
          Add reminder
        </Button>
      </div>
    </form>
  );
};
