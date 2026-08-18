import { beforeAll, describe, expect } from "bun:test";
import { eq } from "drizzle-orm";

import { getDatabase } from "@/lib/database/client";
import { seedDevelopmentDatabase } from "@/lib/database/development";
import { issues } from "@/lib/database/schema";
import { ForbiddenError } from "@/lib/errors";
import { createIssue, deleteIssue, setIssueLabels } from "@/lib/issues/actions";
import { getIssueDetail } from "@/lib/issues/detail-queries";
import { findIssueByReference } from "@/lib/issues/queries";
import { createLabel, deleteLabel } from "@/lib/labels/actions";
import { listLabels, listLabelsWithIssueCounts } from "@/lib/labels/queries";
import { addProjectUpdate, createProject, deleteProjectUpdate } from "@/lib/projects/actions";
import { getProjectDetail } from "@/lib/projects/queries";
import { getCurrentUser } from "@/lib/session/current-user";
import { listAllMembers } from "@/lib/users/queries";
import { createWorkflowState, deleteWorkflowState } from "@/lib/workflow/actions";
import { listStates, listStatesWithIssueCounts } from "@/lib/workflow/queries";

import { actingAs, signedInTest } from "./act-as";

beforeAll(async () => {
  await seedDevelopmentDatabase();
});

const ordinaryMembers = async () => (await listAllMembers()).filter((member) => !member.isAdmin && !member.hasLeft);

/**
 * Nothing here is recoverable, and project access only answers "may they see
 * this" — so ending something follows the rule comments already do: the person
 * who wrote it, or an admin.
 */
describe("who may destroy what", () => {
  signedInTest("an issue is its creator's to delete, or an admin's", async () => {
    const [author, bystander] = await ordinaryMembers();
    expect(author).toBeDefined();
    expect(bystander).toBeDefined();

    const theirs = await actingAs(author!.identifier, () => createIssue({ title: "Somebody else's issue" }));
    await actingAs(bystander!.identifier, async () => {
      await expect(deleteIssue(theirs.identifier)).rejects.toThrow(
        "Only the issue's creator or an admin can delete an issue.",
      );
      await expect(deleteIssue(theirs.identifier)).rejects.toThrow(ForbiddenError);
    });
    expect(await findIssueByReference(theirs.reference)).not.toBeNull();

    await actingAs(author!.identifier, () => deleteIssue(theirs.identifier));
    expect(await findIssueByReference(theirs.reference)).toBeNull();

    const moderated = await actingAs(author!.identifier, () => createIssue({ title: "Issue an admin removes" }));
    await deleteIssue(moderated.identifier);
    expect(await findIssueByReference(moderated.reference)).toBeNull();
  });

  /**
   * `projects.health` is written from the newest update, so deleting one has to
   * answer for the badge, or the project keeps asserting a health whose only
   * explanation has been deleted.
   */
  signedInTest("a project update is its author's to delete, and the health badge goes with it", async () => {
    const [author, bystander] = await ordinaryMembers();
    expect(author).toBeDefined();
    expect(bystander).toBeDefined();

    const project = await createProject({ name: "Health of a programme" });
    await actingAs(author!.identifier, async () => {
      await addProjectUpdate(project.identifier, "on_track", "Week one: on course.");
      await addProjectUpdate(project.identifier, "off_track", "Week two: we have a problem.");
    });
    const posted = await getProjectDetail(project.identifier);
    expect(posted?.health).toBe("off_track");
    const newest = posted?.updates.find((update) => update.body.startsWith("Week two"));
    expect(newest).toBeDefined();

    await actingAs(bystander!.identifier, async () => {
      await expect(deleteProjectUpdate(newest!.identifier)).rejects.toThrow(
        "Only the author or an admin can delete a project update.",
      );
    });
    expect((await getProjectDetail(project.identifier))?.health).toBe("off_track");

    await actingAs(author!.identifier, () => deleteProjectUpdate(newest!.identifier));
    const remaining = await getProjectDetail(project.identifier);
    expect(remaining?.updates).toHaveLength(1);
    expect(remaining?.health).toBe("on_track");

    // With no update left the project shows no verdict, rather than one nothing in
    // its feed accounts for.
    await deleteProjectUpdate(remaining!.updates[0]!.identifier);
    const emptied = await getProjectDetail(project.identifier);
    expect(emptied?.updates).toHaveLength(0);
    expect(emptied?.health).toBeNull();
  });

  /**
   * `issue_labels` cascades, so deleting a label strips it from every issue in the
   * workspace — the same mass rewrite that makes deleting a status admin-only.
   * Creating and renaming labels is still every member's.
   */
  signedInTest("a label is an admin's to delete, and every issue that loses one says so", async () => {
    const [member] = await ordinaryMembers();
    expect(member).toBeDefined();

    const label = await createLabel({ name: "Doomed label", color: "#eb5757" });
    const issue = await createIssue({ title: "Issue wearing a doomed label" });
    await setIssueLabels(issue.identifier, [label.identifier]);
    expect((await listLabelsWithIssueCounts()).find((entry) => entry.identifier === label.identifier)?.issueCount).toBe(1);

    await actingAs(member!.identifier, async () => {
      await expect(deleteLabel(label.identifier)).rejects.toThrow(ForbiddenError);
      await createLabel({ name: "Label a member made", color: "#27ae60" });
    });
    expect((await listLabels()).some((entry) => entry.identifier === label.identifier)).toBe(true);

    await deleteLabel(label.identifier);
    expect((await listLabels()).some((entry) => entry.identifier === label.identifier)).toBe(false);

    // The feed resolves label names live, so an "added" with no "removed"
    // reads as a label the issue is still wearing and nobody ever took off.
    const currentUser = await getCurrentUser();
    const detail = await getIssueDetail(issue.reference, currentUser.identifier);
    const aboutTheLabel = detail?.activities.filter((activity) => activity.payload.labelIdentifier === label.identifier);
    expect(aboutTheLabel?.map((activity) => activity.type)).toEqual(["label_added", "label_removed"]);
    expect(detail?.issue.labels).toEqual([]);
  });
});

/**
 * Deleting a status moves every issue in it, which is a state change made to
 * other people's issues in bulk — so it obeys what a state change means
 * everywhere else: the completion date, and an entry in each issue's history.
 */
describe("deleting a workflow status", () => {
  signedInTest("keeps each issue's completion date when both statuses are completed", async () => {
    await createWorkflowState({ name: "Shipped to staging", type: "completed", color: "#4cb782" });
    const shipped = (await listStates()).find((state) => state.name === "Shipped to staging")!;
    const done = (await listStates()).find(
      (state) => state.type === "completed" && state.identifier !== shipped.identifier,
    )!;
    const issue = await createIssue({ title: "Completed months ago", stateIdentifier: shipped.identifier });

    // Backdated, which is the point: `stateTimestamps` answers for an issue
    // *entering* a status, so a move between two completed statuses must not
    // restamp it.
    const database = await getDatabase();
    const completedAt = new Date("2026-01-09T10:00:00.000Z");
    await database.update(issues).set({ completedAt }).where(eq(issues.identifier, issue.identifier));

    await deleteWorkflowState(shipped.identifier, done.identifier);

    const moved = await findIssueByReference(issue.reference);
    expect(moved?.state.identifier).toBe(done.identifier);
    expect(moved?.completedAt).toEqual(completedAt);
  });

  signedInTest("writes the move into the history of every issue it rewrites", async () => {
    const admin = await getCurrentUser();
    await createWorkflowState({ name: "Interim review", type: "started", color: "#f2c94c" });
    const interim = (await listStates()).find((state) => state.name === "Interim review")!;
    const issue = await createIssue({ title: "Moved out from under its assignee", stateIdentifier: interim.identifier });
    const replacement = (await listStates()).find((state) => state.type === "backlog")!;

    expect(
      (await listStatesWithIssueCounts()).find((state) => state.identifier === interim.identifier)?.issueCount,
    ).toBe(1);

    await deleteWorkflowState(interim.identifier, replacement.identifier);

    const detail = await getIssueDetail(issue.reference, admin.identifier);
    const move = detail?.activities.filter((activity) => activity.type === "state_changed").at(-1);
    expect(move?.actor?.identifier).toBe(admin.identifier);
    expect(move?.payload).toMatchObject({
      fromStateIdentifier: interim.identifier,
      fromStateName: "Interim review",
      toStateIdentifier: replacement.identifier,
      toStateName: replacement.name,
    });
  });
});
