import { afterAll, beforeAll, describe, expect } from "bun:test";
import { eq, inArray } from "drizzle-orm";

import { getDatabase } from "@/lib/database/client";
import { seedDevelopmentDatabase } from "@/lib/database/development";
import { issueReminders, users } from "@/lib/database/schema";
import { createIssue, setIssueDueDate } from "@/lib/issues/actions";
import { createProject, setProjectAccessRoles } from "@/lib/projects/actions";
import { createDiscordWebhook, createIssueReminder, deleteDiscordWebhook } from "@/lib/reminders/actions";
import { dispatchDueReminders } from "@/lib/reminders/dispatch";
import { listDiscordWebhooks, listIssueReminders } from "@/lib/reminders/queries";
import { listAllMembers } from "@/lib/users/queries";
import { minimumReminderRepeatMinutes } from "@/lib/validation/schemas";

import { actingAs, signedInTest } from "./act-as";

const webhookUrl = "https://discord.com/api/webhooks/123456789012345678/abcDEF-ghi_JKL";
const originalFetch = globalThis.fetch;
const posted: { url: string; body: unknown }[] = [];

const acceptPost = (): Response => new Response(null, { status: 204 });
let webhookResponse: () => Response | Promise<Response> = acceptPost;

beforeAll(async () => {
  await seedDevelopmentDatabase();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    posted.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return webhookResponse();
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("Discord due-date reminders", () => {
  signedInTest("counts the reminders that would go with a webhook", async () => {
    await createDiscordWebhook({ name: "#counted", url: webhookUrl });
    const webhook = (await listDiscordWebhooks()).find((candidate) => candidate.name === "#counted");
    expect(webhook?.reminderCount).toBe(0);
    const issue = await createIssue({ title: "Counted issue" });
    await setIssueDueDate(issue.identifier, "2030-01-01");
    for (const timeOfDay of ["09:00", "10:00"]) {
      await createIssueReminder(issue.identifier, {
        webhookIdentifier: webhook!.identifier,
        leadMinutes: 60,
        repeatEveryMinutes: null,
        timeOfDay,
        message: "",
      });
    }
    const counted = (await listDiscordWebhooks()).find((candidate) => candidate.name === "#counted");
    expect(counted?.reminderCount).toBe(2);
    // Only its own: another webhook's reminders must not be counted here.
    const untouched = (await listDiscordWebhooks()).filter((candidate) => candidate.name !== "#counted");
    expect(untouched.every((candidate) => candidate.reminderCount === 0)).toBe(true);
  });

  signedInTest("schedules from the due date and posts to the chosen webhook when due", async () => {
    await createDiscordWebhook({ name: "#deadlines", url: webhookUrl });
    const webhook = (await listDiscordWebhooks()).find((candidate) => candidate.name === "#deadlines");
    expect(webhook?.maskedUrl).toBe("https://discord.com/api/webhooks/123456789012345678/…");
    if (!webhook) {
      return;
    }

    const issue = await createIssue({ title: "Ship reminders" });
    await createIssueReminder(issue.identifier, {
      webhookIdentifier: webhook.identifier,
      leadMinutes: 1_440,
      repeatEveryMinutes: null,
      timeOfDay: "18:00",
      message: "Heads up <@&1>",
    });
    let [reminder] = await listIssueReminders(issue.identifier);
    expect(reminder?.nextRunAt).toBeNull();

    // Setting a due date computes the run time: the day before at 18:00 KST.
    const dueDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    await setIssueDueDate(issue.identifier, dueDate);
    [reminder] = await listIssueReminders(issue.identifier);
    const scheduledAt = reminder?.nextRunAt ?? null;
    expect(scheduledAt).not.toBeNull();

    expect(await dispatchDueReminders()).toBe(0);

    const database = await getDatabase();
    await database
      .update(issueReminders)
      .set({ nextRunAt: new Date(Date.now() - 1000) })
      .where(eq(issueReminders.identifier, reminder!.identifier));
    expect(await dispatchDueReminders()).toBe(1);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.url).toBe(webhookUrl);
    const body = posted[0]?.body as { content: string; embeds: { title: string }[] };
    expect(body.content).toBe("Heads up <@&1>");
    expect(body.embeds[0]?.title).toBe(`${issue.reference} Ship reminders`);

    [reminder] = await listIssueReminders(issue.identifier);
    expect(reminder?.lastSentAt).not.toBeNull();
    expect(reminder?.lastError).toBeNull();
    // The next run is always derived from the due date, never from the send.
    expect(reminder?.nextRunAt?.toISOString()).toBe(scheduledAt?.toISOString());

    // Two dispatchers racing on the same due row must not post twice: each
    // row is claimed on its own, and only one claim can match a due row.
    await database
      .update(issueReminders)
      .set({ nextRunAt: new Date(Date.now() - 1000) })
      .where(eq(issueReminders.identifier, reminder!.identifier));
    const [first, second] = await Promise.all([dispatchDueReminders(), dispatchDueReminders()]);
    expect(first + second).toBe(1);
    expect(posted).toHaveLength(2);

    await deleteDiscordWebhook(webhook.identifier);
    expect(await listIssueReminders(issue.identifier)).toHaveLength(0);
  });
});

/**
 * A reminder belongs to the issue it is set on, not to whoever typed it: only
 * somebody with access can create one, and which channel it posts to is their
 * call — so their own access is not what decides whether it may still be sent.
 */
describe("a reminder whose creator is no longer around", () => {
  const restrictedRole = { identifier: "323456789012345678", name: "Core team" };

  signedInTest("keeps posting, because the issue is what it belongs to", async () => {
    const database = await getDatabase();
    await createDiscordWebhook({ name: "#watch", url: webhookUrl });
    const webhook = (await listDiscordWebhooks()).find((candidate) => candidate.name === "#watch");
    expect(webhook).toBeDefined();
    const creator = (await listAllMembers()).find((member) => !member.isAdmin && !member.hasLeft);
    expect(creator).toBeDefined();

    const project = await createProject({ name: "Reminder access project" });
    const issue = await createIssue({ title: "Watched issue", projectIdentifier: project.identifier });
    await setIssueDueDate(issue.identifier, new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10));
    const reminder = await actingAs(creator!.identifier, async () => {
      await createIssueReminder(issue.identifier, {
        webhookIdentifier: webhook!.identifier,
        leadMinutes: 1_440,
        repeatEveryMinutes: null,
        timeOfDay: "09:00",
        message: "",
      });
      const [created] = await listIssueReminders(issue.identifier);
      expect(created).toBeDefined();
      return created!;
    });

    const deliveries = (): number =>
      posted.filter((entry) => JSON.stringify(entry.body).includes("Watched issue")).length;
    const dispatchNow = async (): Promise<void> => {
      await database
        .update(issueReminders)
        .set({ nextRunAt: new Date(Date.now() - 1_000) })
        .where(eq(issueReminders.identifier, reminder.identifier));
      await dispatchDueReminders();
    };

    await dispatchNow();
    expect(deliveries()).toBe(1);

    // The membership is put back whatever happens: the suite shares one database,
    // and a member left flagged as departed strands the rest.
    await database.update(users).set({ leftGuildAt: new Date() }).where(eq(users.id, creator!.identifier));
    try {
      await dispatchNow();
      expect(deliveries()).toBe(2);
    } finally {
      await database.update(users).set({ leftGuildAt: null }).where(eq(users.id, creator!.identifier));
    }

    await setProjectAccessRoles(project.identifier, [restrictedRole]);
    try {
      await dispatchNow();
      expect(deliveries()).toBe(3);
      expect(await listIssueReminders(issue.identifier)).toHaveLength(1);
    } finally {
      await setProjectAccessRoles(project.identifier, []);
    }
  });
});

const waitUntil = async (condition: () => boolean, description: string): Promise<void> => {
  const deadline = Date.now() + 5_000;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting until ${description}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

/**
 * Yesterday, so the one occurrence of a "1 day before" reminder is behind it:
 * just come due, with nothing left in its schedule to fall back on.
 */
const dueDateYesterday = (): string => new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

const registerWebhook = async (name: string): Promise<{ readonly identifier: string }> => {
  await createDiscordWebhook({ name, url: webhookUrl });
  const webhook = (await listDiscordWebhooks()).find((candidate) => candidate.name === name);
  if (!webhook) {
    throw new Error(`The webhook ${name} was not registered.`);
  }
  return webhook;
};

const createDueReminder = async (title: string, webhookIdentifier: string): Promise<string> => {
  const database = await getDatabase();
  const issue = await createIssue({ title });
  await setIssueDueDate(issue.identifier, dueDateYesterday());
  await createIssueReminder(issue.identifier, {
    webhookIdentifier,
    leadMinutes: 1_440,
    repeatEveryMinutes: null,
    timeOfDay: "18:00",
    message: title,
  });
  const [reminder] = await listIssueReminders(issue.identifier);
  if (!reminder) {
    throw new Error(`The reminder for ${title} was not created.`);
  }
  await database
    .update(issueReminders)
    .set({ nextRunAt: new Date(Date.now() - 1_000) })
    .where(eq(issueReminders.identifier, reminder.identifier));
  return reminder.identifier;
};

const readReminder = async (identifier: string) => {
  const database = await getDatabase();
  const reminder = await database.query.issueReminders.findFirst({ where: eq(issueReminders.identifier, identifier) });
  if (!reminder) {
    throw new Error("The reminder is gone.");
  }
  return reminder;
};

/**
 * The default cadence posts once, the day before, and nothing else ever
 * recomputes `nextRunAt` — so advancing the schedule before the post would spend
 * that single occurrence on a 429.
 */
describe("a reminder Discord refuses", () => {
  signedInTest("is retried rather than consumed", async () => {
    const webhook = await registerWebhook("#retries");
    const reminderIdentifier = await createDueReminder("Refused reminder", webhook.identifier);
    try {
      // Discord's rate limit, with the delay it asks to be left alone for.
      webhookResponse = () =>
        new Response('{"message": "You are being rate limited.", "retry_after": 30}', {
          status: 429,
          headers: { "retry-after": "30" },
        });
      expect(await dispatchDueReminders()).toBe(1);
      const rateLimited = await readReminder(reminderIdentifier);
      expect(rateLimited.lastSentAt).toBeNull();
      expect(rateLimited.lastError).toContain("429");
      expect(rateLimited.nextRunAt).not.toBeNull();
      expect(rateLimited.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
      expect(rateLimited.nextRunAt!.getTime()).toBeLessThanOrEqual(Date.now() + 40_000);
      expect(await dispatchDueReminders()).toBe(0);

      // A failure Discord says nothing about backs off on its own.
      webhookResponse = () => new Response("Internal Server Error", { status: 500 });
      expect(await dispatchDueReminders(new Date(Date.now() + 60_000))).toBe(1);
      const failed = await readReminder(reminderIdentifier);
      expect(failed.lastSentAt).toBeNull();
      expect(failed.lastError).toContain("500");
      expect(failed.nextRunAt!.getTime()).toBeGreaterThan(Date.now());

      webhookResponse = acceptPost;
      expect(await dispatchDueReminders(new Date(Date.now() + 30 * 60_000))).toBe(1);
      const sent = await readReminder(reminderIdentifier);
      expect(sent.lastSentAt).not.toBeNull();
      expect(sent.lastError).toBeNull();
      expect(sent.nextRunAt).toBeNull();
      expect(posted.filter((entry) => JSON.stringify(entry.body).includes("Refused reminder"))).toHaveLength(3);
    } finally {
      webhookResponse = acceptPost;
      await deleteDiscordWebhook(webhook.identifier);
    }
  });
});

/**
 * `scheduleRetry` bounds the attempts one occurrence gets, but the reschedule
 * that ends an occurrence puts the count back to zero — and Discord's 404 says
 * the webhook is gone, which no amount of waiting undoes.
 */
describe("a reminder whose webhook Discord no longer has", () => {
  signedInTest("stops rather than spending its attempts again on the next occurrence", async () => {
    const webhook = await registerWebhook("#deleted-in-discord");
    const reminderIdentifier = await createDueReminder("Reminder to a deleted webhook", webhook.identifier);
    try {
      webhookResponse = () => new Response('{"message": "Unknown Webhook", "code": 10015}', { status: 404 });
      expect(await dispatchDueReminders()).toBe(1);

      const stopped = await readReminder(reminderIdentifier);
      expect(stopped.lastSentAt).toBeNull();
      expect(stopped.lastError).toContain("404");
      expect(stopped.nextRunAt).toBeNull();

      expect(await dispatchDueReminders()).toBe(0);
      expect(posted.filter((entry) => JSON.stringify(entry.body).includes("deleted webhook"))).toHaveLength(1);
    } finally {
      webhookResponse = acceptPost;
      await deleteDiscordWebhook(webhook.identifier);
    }
  });
});

/**
 * A pass claims what it is about to deliver, and nothing else: claiming every
 * due row in the statement that found them leaves the reminders the pass never
 * reached looking finished, and nothing in the app recomputes those.
 */
describe("a dispatch pass that does not finish", () => {
  signedInTest("leaves the reminders it never reached due", async () => {
    const database = await getDatabase();
    const webhook = await registerWebhook("#interrupted");
    const identifiers = [];
    for (const index of [1, 2, 3, 4]) {
      identifiers.push(await createDueReminder(`Interrupted pass ${index}`, webhook.identifier));
    }

    let releaseFirstPost: () => void = () => undefined;
    const firstPost = new Promise<Response>((resolve) => {
      releaseFirstPost = () => resolve(acceptPost());
    });
    let posts = 0;
    webhookResponse = () => {
      posts += 1;
      return posts === 1 ? firstPost : acceptPost();
    };
    try {
      // The pass is left hanging on the first delivery, where a slow webhook
      // or a redeploy would leave it.
      const pass = dispatchDueReminders();
      await waitUntil(() => posts > 0, "the pass has reached the webhook");
      const midPass = await database.query.issueReminders.findMany({
        where: inArray(issueReminders.identifier, identifiers),
      });
      expect(midPass).toHaveLength(4);
      expect(midPass.filter((row) => row.nextRunAt === null)).toHaveLength(0);
      expect(midPass.filter((row) => (row.nextRunAt?.getTime() ?? 0) > Date.now())).toHaveLength(1);
      expect(midPass.filter((row) => (row.nextRunAt?.getTime() ?? Number.MAX_SAFE_INTEGER) <= Date.now())).toHaveLength(3);

      releaseFirstPost();
      expect(await pass).toBe(4);
      const afterPass = await database.query.issueReminders.findMany({
        where: inArray(issueReminders.identifier, identifiers),
      });
      expect(afterPass.filter((row) => row.lastSentAt !== null)).toHaveLength(4);
      expect(afterPass.filter((row) => row.lastError === null)).toHaveLength(4);
    } finally {
      releaseFirstPost();
      webhookResponse = acceptPost;
      await deleteDiscordWebhook(webhook.identifier);
    }
  });
});

/**
 * A reminder keeps posting until its deadline, so how fast it may repeat is the
 * only thing bounding one call: a minute apart against a deadline a year out is
 * half a million posts. The floor lives in the schema, not in the form's menu.
 */
describe("how fast a reminder may repeat", () => {
  signedInTest("is floored for every caller, not only the ones offered a menu", async () => {
    const webhook = await registerWebhook("#flood");
    const issue = await createIssue({ title: "Repeat cadence floor" });
    await setIssueDueDate(issue.identifier, "2031-01-01");
    const everyMinute = {
      webhookIdentifier: webhook.identifier,
      leadMinutes: null,
      repeatEveryMinutes: 1,
      timeOfDay: "18:00",
      message: "Standing reminder",
    };
    try {
      await expect(createIssueReminder(issue.identifier, everyMinute)).rejects.toThrow();
      expect(await listIssueReminders(issue.identifier)).toHaveLength(0);

      await createIssueReminder(issue.identifier, {
        ...everyMinute,
        repeatEveryMinutes: minimumReminderRepeatMinutes,
      });
      expect(await listIssueReminders(issue.identifier)).toHaveLength(1);
    } finally {
      await deleteDiscordWebhook(webhook.identifier);
    }
  });
});
