"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { TextInput } from "@/components/ui/text-input";
import { useToast } from "@/components/ui/toast-provider";
import { createDiscordWebhook, deleteDiscordWebhook, testDiscordWebhook } from "@/lib/reminders/actions";
import type { DiscordWebhookSummary } from "@/lib/reminders/queries";

import { SettingsSection } from "./settings-section";

type WebhooksManagerProps = {
  readonly webhooks: readonly DiscordWebhookSummary[];
  /** Anyone may register a webhook or send a test; only admins may delete one. */
  readonly canDelete: boolean;
};

/** Must match what `lib/reminders/actions.ts` accepts. */
const maximumWebhookNameLength = 60;
const webhookUrlPattern = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

const webhookProblem = (name: string, url: string): string | null => {
  if (name.trim().length === 0) {
    return "Enter a name for the webhook.";
  }
  if (name.trim().length > maximumWebhookNameLength) {
    return `A webhook name is at most ${maximumWebhookNameLength} characters.`;
  }
  if (!webhookUrlPattern.test(url.trim())) {
    return "Enter a Discord webhook URL (https://discord.com/api/webhooks/…).";
  }
  return null;
};

export const WebhooksManager = ({ webhooks, canDelete }: WebhooksManagerProps) => {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();

  return (
    <SettingsSection
      title="Discord webhooks"
      description="Channels that due-date reminders can be posted to. Create a webhook in Discord (channel settings › Integrations › Webhooks) and paste its URL."
    >
      <form
        className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          const problem = webhookProblem(name, url);
          if (problem) {
            setError(problem);
            return;
          }
          setError(null);
          startTransition(async () => {
            try {
              await createDiscordWebhook({ name, url });
              setName("");
              setUrl("");
            } catch {
              setError("Could not add the webhook. Try again.");
            }
          });
        }}
      >
        <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Name, e.g. #deadlines" aria-label="Webhook name" className="sm:w-[180px]" />
        <TextInput
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://discord.com/api/webhooks/…"
          aria-label="Webhook URL"
          className="flex-1 font-mono"
          autoComplete="off"
        />
        <Button variant="primary" type="submit" disabled={pending || name.trim().length === 0 || url.trim().length === 0}>
          Add webhook
        </Button>
      </form>
      {error ? <p className="border-b border-border px-4 py-2 text-xs text-danger">{error}</p> : null}
      {webhooks.length === 0 ? <p className="px-4 py-3 text-xs text-foreground-quaternary">No webhooks yet.</p> : null}
      {webhooks.map((webhook) => (
        <div key={webhook.identifier} className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-b-0">
          <Icon name="bell" size={14} className="shrink-0 text-foreground-tertiary" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-foreground">{webhook.name}</div>
            <div className="truncate font-mono text-xs text-foreground-tertiary">{webhook.maskedUrl}</div>
          </div>
          <Button
            variant="secondary"
            size="small"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await testDiscordWebhook(webhook.identifier);
                if (result.ok) {
                  showToast({ title: `Test message sent to ${webhook.name}`, tone: "success" });
                } else {
                  showToast({ title: "Test failed", description: result.error, tone: "danger" });
                }
              })
            }
          >
            Send test
          </Button>
          {canDelete ? (
          <IconButton
            size="inline"
            tone="subtle-danger"
            aria-label={`Delete webhook ${webhook.name}`}
            disabled={pending}
            onClick={() => {
              const attached =
                webhook.reminderCount === 0
                  ? "No reminders use it."
                  : `${webhook.reminderCount} reminder${webhook.reminderCount === 1 ? "" : "s"} post through it and will be deleted with it.`;
              if (window.confirm(`Delete webhook "${webhook.name}"? ${attached}`)) {
                startTransition(() => deleteDiscordWebhook(webhook.identifier));
              }
            }}
          >
            <Icon name="trash" size={14} />
          </IconButton>
          ) : null}
        </div>
      ))}
    </SettingsSection>
  );
};
