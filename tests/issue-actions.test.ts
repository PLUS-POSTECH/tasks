import { beforeAll, describe, expect } from "bun:test";

import { seedDevelopmentDatabase } from "@/lib/database/development";
import {
  addComment,
  addIssueRelation,
  createIssue,
  deleteComment,
  deleteIssue,
  editComment,
  removeIssueRelation,
  setIssueAssignee,
  setIssueLabels,
  setIssueMilestone,
  setIssueParent,
  setIssuePriority,
  setIssueProject,
  setIssueState,
  toggleIssueSubscription,
  updateIssueDescription,
} from "@/lib/issues/actions";
import { eq } from "drizzle-orm";

import { getDatabase } from "@/lib/database/client";
import { comments, issues } from "@/lib/database/schema";
import { getIssueDetail, type CommentSummary } from "@/lib/issues/detail-queries";
import { createMilestone, createProject, deleteMilestone, deleteProject } from "@/lib/projects/actions";
import { getProjectDetail, type MilestoneName } from "@/lib/projects/queries";
import { listSubscribedIssueIdentifiers } from "@/lib/issues/queries";
import { createWorkflowState, deleteWorkflowState } from "@/lib/workflow/actions";
import {
  emptyIssueFilter,
  everyIssueScope,
  filterMeToken,
  parseIssueFilter,
  resolveIssueFilter,
} from "@/lib/issues/filters";
import { findIssueByReference, listIssues } from "@/lib/issues/queries";
import { getCurrentUser } from "@/lib/session/current-user";
import { getWorkspace } from "@/lib/workspace/queries";
import { listLabels } from "@/lib/labels/queries";
import { listStates } from "@/lib/workflow/queries";
import { listAllMembers, listMembers } from "@/lib/users/queries";
import { archiveAllReadNotifications, archiveNotification } from "@/lib/notifications/actions";
import { countUnreadNotifications, listNotifications } from "@/lib/notifications/queries";

import { actingAs, signedInTest } from "./act-as";

beforeAll(async () => {
  await seedDevelopmentDatabase();
});

describe("issue lifecycle", () => {
  signedInTest("seeds a workspace and resolves a current user", async () => {
    const currentUser = await getCurrentUser();
    expect(currentUser.isAdmin).toBe(true);
    const workspace = await getWorkspace();
    expect(workspace.slug).toBe("acme");
  });

  signedInTest("creates an issue with the next workspace number and default state", async () => {
    const currentUser = await getCurrentUser();
    const before = await listIssues(
      everyIssueScope,
      resolveIssueFilter(emptyIssueFilter, currentUser.identifier),
    );
    // Numbers come from a counter that only moves forward, so they outrun the
    // row count as soon as an issue is deleted.
    const highest = Math.max(...before.map((issue) => issue.number));
    const created = await createIssue({ title: "Write tests" });
    expect(created.reference).toBe(`#${highest + 1}`);

    const issue = await findIssueByReference(created.reference);
    if (!issue) {
      throw new Error("created issue not found");
    }
    expect(issue.title).toBe("Write tests");
    expect(["backlog", "unstarted"]).toContain(issue.state.type);
    expect(issue.creator?.identifier).toBe(currentUser.identifier);
  });

  signedInTest("updates state, priority, assignee, labels and records activity", async () => {
    const currentUser = await getCurrentUser();
    const created = await createIssue({ title: "Ship it" });
    const states = await listStates();
    const done = states.find((state) => state.type === "completed");
    const members = await listMembers();
    const labels = await listLabels();
    const assignee = members.find((member) => member.identifier !== currentUser.identifier);
    const label = labels[0];
    if (!done || !assignee || !label) {
      throw new Error("fixtures missing");
    }

    await setIssueState(created.identifier, done.identifier);
    await setIssuePriority(created.identifier, 1);
    await setIssueAssignee(created.identifier, assignee.identifier);
    await setIssueLabels(created.identifier, [label.identifier]);
    await addComment(created.identifier, "Looks good");

    const detail = await getIssueDetail(created.reference, currentUser.identifier);
    expect(detail?.issue.state.identifier).toBe(done.identifier);
    expect(detail?.issue.completedAt).not.toBeNull();
    expect(detail?.issue.priority).toBe(1);
    expect(detail?.issue.assignee?.identifier).toBe(assignee.identifier);
    expect(detail?.issue.labels.map((entry) => entry.identifier)).toEqual([label.identifier]);
    expect(detail?.comments).toHaveLength(1);
    expect(detail?.activities.map((activity) => activity.type)).toEqual(
      expect.arrayContaining(["created", "state_changed", "priority_changed", "assignee_changed", "label_added", "commented"]),
    );
    expect(detail?.subscribers.some((subscriber) => subscriber.identifier === assignee.identifier)).toBe(true);
  });

  signedInTest("filters by assignee token, priority, and search", async () => {
    const currentUser = await getCurrentUser();
    const mine = await listIssues(
      everyIssueScope,
      resolveIssueFilter(
        { ...emptyIssueFilter, assigneeIdentifiers: [filterMeToken] },
        currentUser.identifier,
      ),
    );
    expect(mine.every((issue) => issue.assignee?.identifier === currentUser.identifier)).toBe(true);

    const urgent = await listIssues(
      everyIssueScope,
      resolveIssueFilter({ ...emptyIssueFilter, priorities: [1] }, currentUser.identifier),
    );
    expect(urgent.every((issue) => issue.priority === 1)).toBe(true);

    const byReference = await listIssues(
      everyIssueScope,
      resolveIssueFilter({ ...emptyIssueFilter, search: "#1" }, currentUser.identifier),
    );
    expect(byReference.some((issue) => issue.reference === "#1")).toBe(true);
  });

  signedInTest("refuses to make an issue its own parent", async () => {
    const created = await createIssue({ title: "Self parent" });
    await expect(setIssueParent(created.identifier, created.identifier)).rejects.toThrow();
  });

  signedInTest("records the inverse of a relation on the other issue", async () => {
    const one = await createIssue({ title: "Relation source" });
    const two = await createIssue({ title: "Relation target" });
    await addIssueRelation(one.identifier, two.identifier, "blocks");
    const currentUser = await getCurrentUser();
    expect((await getIssueDetail(two.reference, currentUser.identifier))?.relations[0]?.type).toBe("blocked_by");
  });

  signedInTest("subscribes whoever comments, and lets them opt back out", async () => {
    const currentUser = await getCurrentUser();
    const created = await createIssue({ title: "Subscription by comment" });
    await addComment(created.identifier, "First note");
    expect(await listSubscribedIssueIdentifiers(currentUser.identifier)).toContain(created.identifier);
    expect(await toggleIssueSubscription(created.identifier)).toBe(false);
    expect(await toggleIssueSubscription(created.identifier)).toBe(true);
  });

  signedInTest("clears the milestone when the issue leaves the project that owns it", async () => {
    const currentUser = await getCurrentUser();
    const created = await createIssue({ title: "Placement" });
    const project = await createProject({ name: "Placement project" });
    await setIssueProject(created.identifier, project.identifier);
    await createMilestone(project.identifier, { name: "Phase one" });
    const [milestone] = (await getProjectDetail(project.identifier))?.milestones ?? [];
    await setIssueMilestone(created.identifier, milestone!.identifier);
    expect((await getIssueDetail(created.reference, currentUser.identifier))?.milestone?.name).toBe("Phase one");

    await setIssueProject(created.identifier, null);
    expect((await getIssueDetail(created.reference, currentUser.identifier))?.milestone).toBeNull();
  });

  signedInTest("detaches sub-issues and removes replies when a parent is deleted", async () => {
    const currentUser = await getCurrentUser();
    const parent = await createIssue({ title: "Parent" });
    const child = await createIssue({ title: "Child" });
    await setIssueParent(child.identifier, parent.identifier);
    await addComment(parent.identifier, "Root note");
    const [root] = (await getIssueDetail(parent.reference, currentUser.identifier))!.comments;
    await addComment(parent.identifier, "Reply note", root!.identifier);

    // The top-level list is "has no parent", so a sub-issue pointing at a row that
    // no longer exists would vanish from every list.
    await deleteIssue(parent.identifier);
    const database = await getDatabase();
    expect((await database.query.issues.findFirst({ where: eq(issues.identifier, child.identifier) }))?.parentIdentifier).toBeNull();
    expect(await database.query.comments.findMany({ where: eq(comments.issueIdentifier, parent.identifier) })).toHaveLength(0);
  });

  // Every identifier list reaches `inArray` against a uuid column, so anything
  // else in the URL has to be dropped rather than passed on.
  signedInTest("answers a filter carrying something that is not an identifier", async () => {
    const currentUser = await getCurrentUser();
    const unfiltered = await listIssues(
      everyIssueScope,
      resolveIssueFilter(parseIssueFilter({}), currentUser.identifier),
    );
    const withNonsense = await listIssues(
      everyIssueScope,
      resolveIssueFilter(parseIssueFilter({ label: "abc", assignee: "abc", project: "abc" }), currentUser.identifier),
    );
    expect(withNonsense.map((issue) => issue.identifier)).toEqual(unfiltered.map((issue) => issue.identifier));
  });

  signedInTest("archiving a notification reads it, one at a time and in bulk", async () => {
    const currentUser = await getCurrentUser();
    const inbox = await listNotifications(currentUser.identifier, "inbox");
    const unread = inbox.filter((notification) => notification.readAt === null);
    expect(unread.length).toBeGreaterThan(1);

    await archiveNotification(unread[0]!.identifier);
    // "Archive all" clears the inbox, so it archives unread rows too — and an
    // archived row rendered unread is a row nobody can do anything about.
    await archiveAllReadNotifications();

    const archived = await listNotifications(currentUser.identifier, "archived");
    expect(archived.length).toBeGreaterThanOrEqual(inbox.length);
    expect(archived.every((notification) => notification.archivedAt !== null)).toBe(true);
    expect(archived.every((notification) => notification.readAt !== null)).toBe(true);
    expect(await countUnreadNotifications(currentUser.identifier)).toBe(0);
  });

  signedInTest("keeps each inbox tab to the rows that belong in it", async () => {
    const [member] = (await listAllMembers()).filter((candidate) => !candidate.isAdmin && !candidate.hasLeft);
    expect(member).toBeDefined();
    const issue = await createIssue({ title: "Something to tell somebody about" });
    // Assigning it is what tells them about it.
    await setIssueAssignee(issue.identifier, member!.identifier);

    await actingAs(member!.identifier, async () => {
      const inbox = await listNotifications(member!.identifier, "inbox");
      const fresh = inbox.find((notification) => notification.issue?.identifier === issue.identifier);
      expect(fresh).toBeDefined();

      const archived = await listNotifications(member!.identifier, "archived");
      expect(archived.every((notification) => notification.archivedAt !== null)).toBe(true);
      expect(archived.some((notification) => notification.identifier === fresh!.identifier)).toBe(false);

      await archiveNotification(fresh!.identifier);
      const afterArchiving = await listNotifications(member!.identifier, "archived");
      expect(afterArchiving.some((notification) => notification.identifier === fresh!.identifier)).toBe(true);
      expect(
        (await listNotifications(member!.identifier, "inbox")).some(
          (notification) => notification.identifier === fresh!.identifier,
        ),
      ).toBe(false);
    });
  });

  signedInTest("clears the timestamps of a state's issues when they move to a replacement", async () => {
    await createWorkflowState({ name: "Temporary done", type: "completed", color: "#4cb782" });
    const temporary = (await listStates()).find((state) => state.name === "Temporary done")!;
    const issue = await createIssue({ title: "Completed then moved", stateIdentifier: temporary.identifier });
    expect((await findIssueByReference(issue.reference))?.completedAt).not.toBeNull();

    // The bulk reassignment has to stamp the issues the way a single state
    // change does, or the detail page keeps saying "Completed 3 days ago"
    // about an issue sitting in Backlog.
    const backlog = (await listStates()).find((state) => state.type === "backlog")!;
    await deleteWorkflowState(temporary.identifier, backlog.identifier);
    const moved = await findIssueByReference(issue.reference);
    expect(moved?.state.identifier).toBe(backlog.identifier);
    expect(moved?.completedAt).toBeNull();
  });

  signedInTest("moves the issues of a deleted workflow state to their replacement", async () => {
    await createWorkflowState({ name: "Temporary", type: "started", color: "#f2c94c" });
    const temporary = (await listStates()).find((state) => state.name === "Temporary")!;
    const issue = await createIssue({ title: "Stranded", stateIdentifier: temporary.identifier });
    await expect(deleteWorkflowState(temporary.identifier, temporary.identifier)).rejects.toThrow();

    const replacement = (await listStates()).find((state) => state.identifier !== temporary.identifier)!;
    await deleteWorkflowState(temporary.identifier, replacement.identifier);
    expect((await listStates()).some((state) => state.identifier === temporary.identifier)).toBe(false);
    expect((await findIssueByReference(issue.reference))?.state.identifier).toBe(replacement.identifier);
  });
});

const bodyOf = (comment: CommentSummary | undefined): string | null =>
  comment?.status === "visible" ? comment.body : null;

/**
 * Every comment identifier on an issue page is in its payload, and the Edit and
 * Delete buttons are a UI gate over the actions — so the actions answer for who
 * may do what: delete is the author's or an admin's, edit is only the author's.
 */
describe("who a comment belongs to", () => {
  signedInTest("only its author edits it, and only its author or an admin deletes it", async () => {
    const admin = await getCurrentUser();
    const members = (await listAllMembers()).filter((member) => !member.isAdmin && !member.hasLeft);
    const [author, impostor] = members;
    expect(author).toBeDefined();
    expect(impostor).toBeDefined();

    const issue = await createIssue({ title: "Whose comment is it" });
    await actingAs(author!.identifier, () => addComment(issue.identifier, "The author's own words"));
    const commentsOf = async (): Promise<readonly CommentSummary[]> =>
      (await getIssueDetail(issue.reference, admin.identifier))?.comments ?? [];
    const [comment] = await commentsOf();
    expect(comment).toBeDefined();

    await actingAs(impostor!.identifier, async () => {
      await expect(editComment(comment!.identifier, "I resign, effective today.")).rejects.toThrow(
        "Only the author can edit a comment.",
      );
      await expect(deleteComment(comment!.identifier)).rejects.toThrow(
        "Only the author or an admin can delete a comment.",
      );
    });
    expect(bodyOf((await commentsOf())[0])).toBe("The author's own words");

    await actingAs(author!.identifier, () => editComment(comment!.identifier, "The author's second thoughts"));
    expect(bodyOf((await commentsOf())[0])).toBe("The author's second thoughts");

    await deleteComment(comment!.identifier);
    expect(await commentsOf()).toHaveLength(0);
  });
});

/**
 * `comments.parent_identifier` cascades, so a comment holding replies is only
 * marked deleted and the thread stays standing; one nobody answered is removed
 * outright, because a placeholder anchoring nothing is litter in the feed.
 */
describe("deleting a comment somebody has replied to", () => {
  signedInTest("keeps the replies, and keeps nothing of what was deleted", async () => {
    const admin = await getCurrentUser();
    const [author, replier] = (await listAllMembers()).filter((member) => !member.isAdmin && !member.hasLeft);
    expect(author).toBeDefined();
    expect(replier).toBeDefined();

    const issue = await createIssue({ title: "A thread that outlives its first comment" });
    const commentsOf = async (): Promise<readonly CommentSummary[]> =>
      (await getIssueDetail(issue.reference, admin.identifier))?.comments ?? [];

    await actingAs(author!.identifier, () => addComment(issue.identifier, "The question everyone answered"));
    const [root] = await commentsOf();
    await actingAs(replier!.identifier, () => addComment(issue.identifier, "Somebody else's answer", root!.identifier));

    await actingAs(author!.identifier, () => deleteComment(root!.identifier));

    const remaining = await commentsOf();
    expect(remaining).toHaveLength(2);
    expect(remaining.find((comment) => comment.identifier === root!.identifier)).toEqual({
      status: "deleted",
      identifier: root!.identifier,
      parentIdentifier: null,
      createdAt: expect.any(Date),
    });
    expect(bodyOf(remaining.find((comment) => comment.parentIdentifier === root!.identifier))).toBe(
      "Somebody else's answer",
    );
    expect((await findIssueByReference(issue.reference))?.commentCount).toBe(1);
  });

  signedInTest("leaves nothing behind when nobody replied", async () => {
    const currentUser = await getCurrentUser();
    const issue = await createIssue({ title: "A remark nobody answered" });
    await addComment(issue.identifier, "Thinking out loud");
    const [comment] = (await getIssueDetail(issue.reference, currentUser.identifier))!.comments;

    await deleteComment(comment!.identifier);

    const database = await getDatabase();
    expect(await database.query.comments.findMany({ where: eq(comments.issueIdentifier, issue.identifier) })).toHaveLength(0);
    expect((await getIssueDetail(issue.reference, currentUser.identifier))?.comments).toHaveLength(0);
  });

  // The page a member is looking at was rendered before the deletion and still
  // carries every one of these buttons, so the row left behind refuses them itself.
  signedInTest("is the end of it: no edit, no reply, no second delete", async () => {
    const currentUser = await getCurrentUser();
    const issue = await createIssue({ title: "Nothing left to do to it" });
    await addComment(issue.identifier, "Retracted, but replied to");
    const [root] = (await getIssueDetail(issue.reference, currentUser.identifier))!.comments;
    await addComment(issue.identifier, "An answer that stays", root!.identifier);
    await deleteComment(root!.identifier);

    for (const attempt of [
      () => editComment(root!.identifier, "Second thoughts about words that are gone"),
      () => addComment(issue.identifier, "A late answer", root!.identifier),
      () => deleteComment(root!.identifier),
    ]) {
      await expect(attempt()).rejects.toThrow("That comment was deleted.");
    }
    expect((await getIssueDetail(issue.reference, currentUser.identifier))?.comments).toHaveLength(2);
  });
});

/**
 * Each end of a milestone move is recorded as a pair — which milestone, and what
 * it was called at the time — because two of the three ways an issue loses one
 * are the milestone row going away, with no name left to look up.
 */
describe("what an issue's history says about its milestone", () => {
  const milestoneEntries = async (reference: string, userIdentifier: string) =>
    ((await getIssueDetail(reference, userIdentifier))?.activities ?? [])
      .filter((activity) => activity.type === "milestone_changed")
      .map((activity) => activity.payload);

  const milestoneMove = (from: MilestoneName | null, to: MilestoneName | null) => ({
    fromMilestoneIdentifier: from?.identifier ?? null,
    fromMilestoneName: from?.name ?? null,
    toMilestoneIdentifier: to?.identifier ?? null,
    toMilestoneName: to?.name ?? null,
  });

  signedInTest("records setting one, and losing it with the project", async () => {
    const currentUser = await getCurrentUser();
    const project = await createProject({ name: "Milestone history" });
    const issue = await createIssue({ title: "Issue with a milestone", projectIdentifier: project.identifier });
    await createMilestone(project.identifier, { name: "Phase one" });
    const [milestone] = (await getProjectDetail(project.identifier))?.milestones ?? [];
    expect(milestone).toBeDefined();

    await setIssueMilestone(issue.identifier, milestone!.identifier);
    expect(await milestoneEntries(issue.reference, currentUser.identifier)).toEqual([
      milestoneMove(null, milestone!),
    ]);

    await setIssueMilestone(issue.identifier, milestone!.identifier);
    expect(await milestoneEntries(issue.reference, currentUser.identifier)).toHaveLength(1);

    // Leaving the project takes the milestone with it, which no other entry
    // in the feed accounts for.
    await setIssueProject(issue.identifier, null);
    expect(await milestoneEntries(issue.reference, currentUser.identifier)).toEqual([
      milestoneMove(null, milestone!),
      milestoneMove(milestone!, null),
    ]);
  });

  signedInTest("records the clearing a deleted milestone does through the foreign key", async () => {
    const currentUser = await getCurrentUser();
    const project = await createProject({ name: "Milestone that goes" });
    const issue = await createIssue({ title: "Issue outliving its milestone", projectIdentifier: project.identifier });
    await createMilestone(project.identifier, { name: "Phase two" });
    const [milestone] = (await getProjectDetail(project.identifier))?.milestones ?? [];
    await setIssueMilestone(issue.identifier, milestone!.identifier);

    await deleteMilestone(milestone!.identifier);

    expect((await getIssueDetail(issue.reference, currentUser.identifier))?.milestone).toBeNull();
    expect(await milestoneEntries(issue.reference, currentUser.identifier)).toEqual([
      milestoneMove(null, milestone!),
      milestoneMove(milestone!, null),
    ]);
  });

  /**
   * A milestone subdivides one project, so pinning one belonging to another is
   * refused however visible that project is: the name and target date it would
   * carry describe work the issue is not part of.
   */
  signedInTest("refuses a milestone belonging to a project the issue is not in", async () => {
    const currentUser = await getCurrentUser();
    const roadmap = await createProject({ name: "Roadmap holding a milestone" });
    await createMilestone(roadmap.identifier, { name: "Phase four" });
    const [milestone] = (await getProjectDetail(roadmap.identifier))?.milestones ?? [];
    expect(milestone).toBeDefined();
    const elsewhere = await createProject({ name: "Project holding the issue" });
    const filedElsewhere = await createIssue({
      title: "Issue in another project",
      projectIdentifier: elsewhere.identifier,
    });
    const filedNowhere = await createIssue({ title: "Issue in no project at all" });

    for (const issue of [filedElsewhere, filedNowhere]) {
      await expect(setIssueMilestone(issue.identifier, milestone!.identifier)).rejects.toThrow(
        "That milestone belongs to another project.",
      );
      expect((await getIssueDetail(issue.reference, currentUser.identifier))?.milestone).toBeNull();
      expect(await milestoneEntries(issue.reference, currentUser.identifier)).toEqual([]);
    }
  });

  /**
   * `issues.milestone_identifier` is `on delete set null` and a deleted project
   * takes its milestones with it, so an issue can lose the property with no action
   * involved — which is why the pin here is written straight to the column.
   */
  signedInTest("records it when the milestone goes with its project", async () => {
    const currentUser = await getCurrentUser();
    const roadmap = await createProject({ name: "Roadmap that goes" });
    await createMilestone(roadmap.identifier, { name: "Phase three" });
    const [milestone] = (await getProjectDetail(roadmap.identifier))?.milestones ?? [];
    const issue = await createIssue({ title: "Issue pinned to another project's milestone" });
    const database = await getDatabase();
    await database
      .update(issues)
      .set({ milestoneIdentifier: milestone!.identifier })
      .where(eq(issues.identifier, issue.identifier));

    await deleteProject(roadmap.identifier);

    expect((await getIssueDetail(issue.reference, currentUser.identifier))?.milestone).toBeNull();
    expect(await milestoneEntries(issue.reference, currentUser.identifier)).toEqual([
      milestoneMove(milestone!, null),
    ]);
  });
});

/**
 * A relation is one fact about two issues, and the properties panel offers the
 * same ✕ at either end — so both ends have to account for adding and removing
 * it in their own feed.
 */
describe("both ends of a relation", () => {
  signedInTest("accounts for adding and removing in each issue's own feed", async () => {
    const currentUser = await getCurrentUser();
    const blocker = await createIssue({ title: "The issue that blocks" });
    const blocked = await createIssue({ title: "The issue that waits" });
    const relationEntries = async (reference: string) =>
      ((await getIssueDetail(reference, currentUser.identifier))?.activities ?? [])
        .filter((activity) => activity.type === "relation_added" || activity.type === "relation_removed")
        .map((activity) => ({
          type: activity.type,
          relatedIssueIdentifier: activity.payload.relatedIssueIdentifier,
          relationType: activity.payload.relationType,
        }));

    await addIssueRelation(blocker.identifier, blocked.identifier, "blocks");
    expect(await relationEntries(blocker.reference)).toEqual([
      { type: "relation_added", relatedIssueIdentifier: blocked.identifier, relationType: "blocks" },
    ]);
    // The other end reads it the way its own properties panel does.
    expect(await relationEntries(blocked.reference)).toEqual([
      { type: "relation_added", relatedIssueIdentifier: blocker.identifier, relationType: "blocked_by" },
    ]);

    // The ✕ pressed on the blocked issue, whose panel lists the relation as
    // incoming; the row it names is the same one either way.
    const [relation] = (await getIssueDetail(blocked.reference, currentUser.identifier))?.relations ?? [];
    expect(relation).toBeDefined();
    await removeIssueRelation(relation!.identifier);

    expect((await relationEntries(blocked.reference)).at(-1)).toEqual({
      type: "relation_removed",
      relatedIssueIdentifier: blocker.identifier,
      relationType: "blocked_by",
    });
    expect((await relationEntries(blocker.reference)).at(-1)).toEqual({
      type: "relation_removed",
      relatedIssueIdentifier: blocked.identifier,
      relationType: "blocks",
    });
  });
});

/**
 * A description is the longest field in the app, up to 50,000 characters, and an
 * overwrite in the browser is only recoverable from what the feed kept of it.
 */
describe("what the feed keeps of an overwritten description", () => {
  signedInTest("records the text that was replaced, and nothing when nothing changed", async () => {
    const currentUser = await getCurrentUser();
    const issue = await createIssue({ title: "A description worth keeping" });
    const descriptionEntries = async () =>
      ((await getIssueDetail(issue.reference, currentUser.identifier))?.activities ?? [])
        .filter((activity) => activity.type === "description_changed")
        .map((activity) => activity.payload);

    await updateIssueDescription(issue.identifier, "The whole plan, as first written.");
    expect(await descriptionEntries()).toEqual([{ from: null }]);

    await updateIssueDescription(issue.identifier, "Replaced in one keystroke.");
    expect(await descriptionEntries()).toEqual([{ from: null }, { from: "The whole plan, as first written." }]);

    await updateIssueDescription(issue.identifier, "Replaced in one keystroke.");
    expect(await descriptionEntries()).toHaveLength(2);
  });
});
