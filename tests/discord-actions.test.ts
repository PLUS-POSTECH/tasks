import { afterAll, beforeAll, describe, expect } from "bun:test";
import { eq } from "drizzle-orm";

import { updateAuthSettings } from "@/lib/auth/actions";
import { getAuthSettings, isAuthConfigured, loadAuthSettings, toPublicAuthSettings } from "@/lib/auth/settings";
import { getDatabase } from "@/lib/database/client";
import { seedDevelopmentDatabase } from "@/lib/database/development";
import { issueReminders, users, workspaces } from "@/lib/database/schema";
import { createIssue, setIssueDueDate } from "@/lib/issues/actions";
import {
  createDiscordWebhook,
  createIssueReminder,
  deleteIssueReminder,
  sendIssueReminderNow,
  testDiscordWebhook,
} from "@/lib/reminders/actions";
import { listDiscordWebhooks, listIssueReminders } from "@/lib/reminders/queries";
import { findCurrentUser } from "@/lib/session/current-user";
import { removeMember, syncMembersNow, updateOwnProfile } from "@/lib/settings/actions";
import { listAllMembers } from "@/lib/users/queries";

import { signedInTest } from "./act-as";

const guild = "100000000000000000";
const webhookUrl = "https://discord.com/api/webhooks/222222222222222222/coverage-token";
const originalFetch = globalThis.fetch;
const posted: { readonly url: string; readonly body: string }[] = [];
let webhookStatus = 204;

beforeAll(async () => {
  await seedDevelopmentDatabase();
  const database = await getDatabase();
  await database.update(workspaces).set({ discordBotToken: "test-bot-token", discordGuildIdentifier: guild });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/webhooks/")) {
      posted.push({ url, body: String(init?.body ?? "") });
      return webhookStatus === 204 ? new Response(null, { status: 204 }) : new Response("Unknown Webhook", { status: webhookStatus });
    }
    if (url.endsWith(`/guilds/${guild}`)) {
      return Response.json({ id: guild, name: "Coverage Guild", icon: null, owner_id: "300000000000000009" });
    }
    if (url.endsWith(`/guilds/${guild}/roles`)) {
      return Response.json([]);
    }
    if (url.includes(`/guilds/${guild}/members`)) {
      return Response.json([
        { user: { id: "300000000000000001", username: "coverone", avatar: null }, nick: "Cover One", roles: [] },
      ]);
    }
    throw new Error(`Unexpected fetch ${url}`);
  }) as typeof fetch;
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  const database = await getDatabase();
  await database.update(workspaces).set({ discordBotToken: null });
});

describe("webhook and reminder actions", () => {
  signedInTest("send a test message, a reminder on demand, and report failures", async () => {
    await createDiscordWebhook({ name: "#coverage", url: webhookUrl });
    const webhook = (await listDiscordWebhooks()).find((entry) => entry.name === "#coverage")!;
    expect(webhook.maskedUrl).toBe("https://discord.com/api/webhooks/222222222222222222/…");

    expect(await testDiscordWebhook(webhook.identifier)).toEqual({ ok: true, value: undefined });
    expect(posted.at(-1)?.body).toContain("Test message from Tasks");

    const issue = await createIssue({ title: "Coverage reminder issue" });
    await setIssueDueDate(issue.identifier, "2030-05-05");
    await createIssueReminder(issue.identifier, {
      webhookIdentifier: webhook.identifier,
      leadMinutes: 1_440,
      repeatEveryMinutes: null,
      timeOfDay: "09:00",
      message: "",
    });
    const [reminder] = await listIssueReminders(issue.identifier);
    expect(reminder?.nextRunAt).not.toBeNull();

    expect(await sendIssueReminderNow(reminder!.identifier)).toEqual({ ok: true, value: undefined });
    expect(posted.at(-1)?.body).toContain(issue.reference);
    const [afterSend] = await listIssueReminders(issue.identifier);
    expect(afterSend?.lastSentAt).not.toBeNull();
    expect(afterSend?.nextRunAt?.toISOString()).toBe(reminder!.nextRunAt?.toISOString());

    webhookStatus = 404;
    const failed = await sendIssueReminderNow(reminder!.identifier);
    expect(failed.ok).toBe(false);
    expect(failed.ok === false && failed.error).toContain("404");
    const database = await getDatabase();
    const stored = await database.query.issueReminders.findFirst({ where: eq(issueReminders.identifier, reminder!.identifier) });
    expect(stored?.lastError).toContain("404");
    webhookStatus = 204;

    await deleteIssueReminder(reminder!.identifier);
    expect(await listIssueReminders(issue.identifier)).toHaveLength(0);
  });
});

describe("member administration", () => {
  signedInTest("sync from Discord, then remove a member the sync does not own", async () => {
    const synced = await syncMembersNow();
    expect(synced.ok).toBe(true);
    expect(synced.ok === true && synced.value.name).toBe("Coverage Guild");

    const database = await getDatabase();
    const [inserted] = await database
      .insert(users)
      .values({
        workspaceIdentifier: (await loadAuthSettings()).workspaceIdentifier,
        name: "Removable Person",
        displayName: "removable",
        email: "removable@acme.dev",
        avatarColor: "#eb5757",
      })
      .returning({ identifier: users.id });
    await removeMember(inserted!.identifier);
    expect((await listAllMembers()).some((member) => member.identifier === inserted!.identifier)).toBe(false);
  });

  /**
   * The member sync rewrites `name` for everyone in the server every ten minutes,
   * so a full name typed in Settings › Profile would be saved, confirmed, and gone
   * again within the sync's period.
   */
  signedInTest("leaves a member's full name to Discord while the server owns it", async () => {
    const before = await findCurrentUser();
    expect(before).not.toBeNull();
    try {
      const saved = await updateOwnProfile({
        name: "Typed Over The Server",
        displayName: before!.displayName,
        email: before!.email,
        avatarColor: "#27ae60",
      });
      expect(saved.ok).toBe(true);
      const after = await findCurrentUser();
      expect(after?.name).toBe(before!.name);
      expect(after?.avatarColor).toBe("#27ae60");
    } finally {
      await updateOwnProfile({
        name: before!.name,
        displayName: before!.displayName,
        email: before!.email,
        avatarColor: before!.avatarColor,
      });
    }
  });
});

describe("authentication settings", () => {
  signedInTest("store the Discord application without ever exposing the secret", async () => {
    await updateAuthSettings({
      baseUrl: "https://tasks.example.com/",
      discordClientIdentifier: "200000000000000000",
      discordClientSecret: "coverage-secret",
      discordGuildIdentifier: guild,
      discordBotToken: "",
    });
    const settings = await loadAuthSettings();
    expect(settings.baseUrl).toBe("https://tasks.example.com");
    expect(settings.discordClientSecret).toBe("coverage-secret");
    expect(isAuthConfigured(settings)).toBe(true);
    // The bot token was left empty, which keeps the stored one.
    expect(settings.discordBotToken).toBe("test-bot-token");

    const shown = toPublicAuthSettings(settings);
    expect(JSON.stringify(shown)).not.toContain("coverage-secret");
    expect(shown).toMatchObject({ hasDiscordClientSecret: true, hasDiscordBotToken: true });

    await updateAuthSettings({
      baseUrl: settings.baseUrl!,
      discordClientIdentifier: settings.discordClientIdentifier!,
      discordClientSecret: "",
      discordGuildIdentifier: guild,
      discordBotToken: "",
    });
    expect((await loadAuthSettings()).discordClientSecret).toBe("coverage-secret");
    await expect(
      updateAuthSettings({
        baseUrl: settings.baseUrl!,
        discordClientIdentifier: settings.discordClientIdentifier!,
        discordClientSecret: "",
        discordGuildIdentifier: "not-a-snowflake",
        discordBotToken: "",
      }),
    ).rejects.toThrow();
    expect(getAuthSettings).toBeDefined();
  });

  /**
   * The stored server is the workspace, not a setting on it. The form stops
   * offering the field once one is stored, but the form is not the gate: this
   * is a server action, so the refusal has to live in the action.
   */
  signedInTest("refuse to repoint the workspace at a different Discord server", async () => {
    const settings = await loadAuthSettings();
    await expect(
      updateAuthSettings({
        baseUrl: settings.baseUrl!,
        discordClientIdentifier: settings.discordClientIdentifier!,
        discordClientSecret: "",
        discordGuildIdentifier: "400000000000000000",
        discordBotToken: "",
      }),
    ).rejects.toThrow("The Discord server cannot be changed");
    // Emptying it is the same change: it is how a second server would be set.
    await expect(
      updateAuthSettings({
        baseUrl: settings.baseUrl!,
        discordClientIdentifier: settings.discordClientIdentifier!,
        discordClientSecret: "",
        discordGuildIdentifier: "",
        discordBotToken: "",
      }),
    ).rejects.toThrow("The Discord server cannot be changed");
    expect((await loadAuthSettings()).discordGuildIdentifier).toBe(guild);
  });
});
