import { beforeAll, describe, expect } from "bun:test";
import { eq, inArray } from "drizzle-orm";

import { getDatabase } from "@/lib/database/client";
import { seedDevelopmentDatabase } from "@/lib/database/development";
import { issueReminders, projects, users } from "@/lib/database/schema";
import { addComment, createIssue, setIssueAssignee, setIssueDueDate } from "@/lib/issues/actions";
import { getIssueDetail } from "@/lib/issues/detail-queries";
import { addProjectUpdate, createProject } from "@/lib/projects/actions";
import { getProjectDetail } from "@/lib/projects/queries";
import { createDiscordWebhook, createIssueReminder, deleteDiscordWebhook } from "@/lib/reminders/actions";
import { listDiscordWebhooks, listIssueReminders } from "@/lib/reminders/queries";
import { getCurrentUser } from "@/lib/session/current-user";
import { removeMember } from "@/lib/settings/actions";
import { listAllMembers, listMembers } from "@/lib/users/queries";
import { nameOfMember } from "@/lib/users/summary";
import { getWorkspace } from "@/lib/workspace/queries";

import { actingAs, signedInTest } from "./act-as";

/**
 * Removing a member detaches what they wrote — the project updates are the
 * workspace's own record of how a project was going. Somebody the server still
 * lists would be recreated by the sync, so removing them is refused.
 */

beforeAll(async () => {
  await seedDevelopmentDatabase();
});

const insertMember = async (name: string, discordUserIdentifier: string | null): Promise<string> => {
  const database = await getDatabase();
  const workspace = await getWorkspace();
  const [member] = await database
    .insert(users)
    .values({
      workspaceIdentifier: workspace.identifier,
      name,
      displayName: name.toLowerCase().replaceAll(" ", "-"),
      email: `${name.toLowerCase().replaceAll(" ", "-")}@acme.dev`,
      avatarColor: "#eb5757",
      discordUserIdentifier,
    })
    .returning({ identifier: users.id });
  if (!member) {
    throw new Error(`The member ${name} was not created.`);
  }
  return member.identifier;
};

describe("removing a member", () => {
  signedInTest("keeps the project updates they wrote", async () => {
    const database = await getDatabase();
    const project = await createProject({ name: "Removal project" });
    // Somebody the Discord sync does not own, which is who removal is for.
    const author = await insertMember("Departing Author", null);
    try {
      await actingAs(author, async () => {
        await addProjectUpdate(project.identifier, "on_track", "Week one: the plan holds.");
        await addProjectUpdate(project.identifier, "at_risk", "Week two: it does not.");
      });
      const before = await getProjectDetail(project.identifier);
      expect(before?.updates.map((update) => update.author?.identifier)).toEqual([author, author]);

      await removeMember(author);

      const after = await getProjectDetail(project.identifier);
      expect(after?.updates.map((update) => update.body)).toEqual([
        "Week two: it does not.",
        "Week one: the plan holds.",
      ]);
      expect(after?.updates.map((update) => update.author)).toEqual([null, null]);
    } finally {
      await database.delete(projects).where(eq(projects.identifier, project.identifier));
      await database.delete(users).where(inArray(users.id, [author]));
    }
  });

  /**
   * A reminder is not an artefact of the person who typed it: it posts an issue
   * the workspace owns into a channel the workspace registered, so it outlives
   * them and keeps reminding whoever the issue is for now.
   */
  signedInTest("keeps the Discord reminders they set up", async () => {
    const database = await getDatabase();
    const author = await insertMember("Departing Reminder Author", null);
    await createDiscordWebhook({ name: "#outliving", url: "https://discord.com/api/webhooks/444444444444444444/removal-token" });
    const webhook = (await listDiscordWebhooks()).find((entry) => entry.name === "#outliving");
    expect(webhook).toBeDefined();
    const issue = await createIssue({ title: "Issue with an outliving reminder" });
    await setIssueDueDate(issue.identifier, "2031-02-02");
    try {
      await actingAs(author, () =>
        createIssueReminder(issue.identifier, {
          webhookIdentifier: webhook!.identifier,
          leadMinutes: 1_440,
          repeatEveryMinutes: null,
          timeOfDay: "09:00",
          message: "",
        }),
      );

      await removeMember(author);

      const [kept] = await listIssueReminders(issue.identifier);
      expect(kept).toBeDefined();
      expect(kept?.nextRunAt).not.toBeNull();
      const stored = await database.query.issueReminders.findFirst({
        where: eq(issueReminders.identifier, kept!.identifier),
      });
      expect(stored?.createdByIdentifier).toBeNull();
    } finally {
      // Deleting the webhook takes its reminders, which is what clears up here.
      await deleteDiscordWebhook(webhook!.identifier);
      await database.delete(users).where(inArray(users.id, [author]));
    }
  });

  /**
   * While there is a row to read, the comment signature, the activity feed and the
   * assignment all read it, so somebody who left the Discord server is named in
   * all three. Once the row goes, each is left with what it still holds.
   */
  signedInTest("names them from whatever the issue page has left of them", async () => {
    const database = await getDatabase();
    const admin = await getCurrentUser();
    const departing = await insertMember("Departing Assignee", null);
    const issue = await createIssue({ title: "An issue somebody left behind" });
    const namesOnThePage = async () => {
      const detail = await getIssueDetail(issue.reference, admin.identifier);
      const roster = await listAllMembers();
      const assigned = detail?.activities.find((activity) => activity.type === "assignee_added");
      const comment = detail?.comments[0];
      return {
        actor: nameOfMember(roster, assigned?.actor?.identifier),
        insideThePayload: nameOfMember(
          roster,
          assigned?.payload.assigneeIdentifier,
          assigned?.payload.assigneeName,
        ),
        comment: comment?.status === "visible" ? comment.author?.name ?? "Former member" : null,
      };
    };
    try {
      await actingAs(departing, async () => {
        await setIssueAssignee(issue.identifier, departing);
        await addComment(issue.identifier, "Handing this over.");
      });

      // Gone from the Discord server, but the row is still here to be read —
      // and only the whole roster still has it, which is why the feed reads
      // that one rather than the members who can still be assigned things.
      await database.update(users).set({ leftGuildAt: new Date() }).where(eq(users.id, departing));
      expect((await listAllMembers()).some((member) => member.identifier === departing)).toBe(true);
      expect((await listMembers()).some((member) => member.identifier === departing)).toBe(false);
      expect(await namesOnThePage()).toEqual({
        actor: "Departing Assignee",
        insideThePayload: "Departing Assignee",
        comment: "Departing Assignee",
      });

      // Removed outright, which is the deliberate erasure leaving is not: the two
      // foreign keys have nobody left to name, while the assignment kept what the
      // workspace called them when it was made.
      await removeMember(departing);
      expect(await namesOnThePage()).toEqual({
        actor: "Former member",
        insideThePayload: "Departing Assignee",
        comment: "Former member",
      });
    } finally {
      await database.delete(users).where(inArray(users.id, [departing]));
    }
  });

  signedInTest("refuses while the Discord server still lists them", async () => {
    const database = await getDatabase();
    const member = await insertMember("Still In The Server", "600000000000000001");
    try {
      await expect(removeMember(member)).rejects.toThrow(
        "Membership follows the Discord server; remove them there.",
      );
      expect(await database.query.users.findFirst({ where: eq(users.id, member) })).toBeDefined();

      // Once the member sync has found them gone, the row is the workspace's to tidy
      // up.
      await database.update(users).set({ leftGuildAt: new Date() }).where(eq(users.id, member));
      await removeMember(member);
      expect(await database.query.users.findFirst({ where: eq(users.id, member) })).toBeUndefined();
    } finally {
      await database.delete(users).where(inArray(users.id, [member]));
    }
  });
});
