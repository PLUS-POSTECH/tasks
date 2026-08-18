import { z } from "zod";

import { discordRequest } from "./client";

const webhookUrlPattern = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export const discordWebhookUrlSchema = z
  .string()
  .trim()
  .regex(webhookUrlPattern, "Enter a Discord webhook URL (https://discord.com/api/webhooks/…).");

export type DiscordEmbed = {
  readonly title: string;
  readonly url?: string;
  readonly description?: string;
  readonly color?: number;
  readonly fields?: readonly { readonly name: string; readonly value: string; readonly inline?: boolean }[];
};

export type DiscordWebhookMessage = {
  readonly content?: string;
  readonly embeds?: readonly DiscordEmbed[];
};

/**
 * `allowed_mentions` deliberately leaves out `"everyone"` — the one parse type
 * that covers both `@everyone` and `@here` — so an unattended reminder cannot
 * ping the whole server. Both words still appear in the text and notify nobody;
 * naming a person or a role keeps working.
 */
export const postDiscordWebhook = async (url: string, message: DiscordWebhookMessage): Promise<void> => {
  await discordRequest({
    url,
    credential: { none: true },
    method: "POST",
    body: { ...message, allowed_mentions: { parse: ["users", "roles"] } },
    // The URL carries the webhook's secret token, so failures name the endpoint instead.
    endpointName: "webhook",
  });
};

/** Discord renders `<t:unix:F>` as a localized timestamp for every reader. */
export const discordTimestamp = (instant: Date, style: "F" | "R" | "D" = "F"): string =>
  `<t:${Math.floor(instant.getTime() / 1000)}:${style}>`;
