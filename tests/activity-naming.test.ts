import { beforeAll, describe, expect } from "bun:test";
import { eq } from "drizzle-orm";

import { getDatabase } from "@/lib/database/client";
import { seedDevelopmentDatabase } from "@/lib/database/development";
import { users } from "@/lib/database/schema";
import { nameOfActivitySubject } from "@/lib/issues/activity-subject";
import { createIssue, setIssueAssignee, setIssueLabels, setIssueMilestone, setIssueState } from "@/lib/issues/actions";
import { getIssueDetail, type ActivitySummary } from "@/lib/issues/detail-queries";
import { findIssueByReference } from "@/lib/issues/queries";
import { createLabel, deleteLabel, updateLabel } from "@/lib/labels/actions";
import { listLabels } from "@/lib/labels/queries";
import { createMilestone, createProject, deleteMilestone, updateMilestone } from "@/lib/projects/actions";
import { getProjectDetail, listMilestoneNames } from "@/lib/projects/queries";
import { getCurrentUser } from "@/lib/session/current-user";
import { removeMember } from "@/lib/settings/actions";
import { listAllMembers } from "@/lib/users/queries";
import { nameOfMember } from "@/lib/users/summary";
import { createWorkflowState, deleteWorkflowState, updateWorkflowState } from "@/lib/workflow/actions";
import { listStates } from "@/lib/workflow/queries";
import { getWorkspace } from "@/lib/workspace/queries";

import { signedInTest } from "./act-as";

/**
 * The rule in `nameOfActivitySubject`: the payload carries the subject's
 * identifier and the words used at the time, the feed shows what the subject is
 * called now, and the recorded words are what is left once there is no row.
 */

beforeAll(async () => {
  await seedDevelopmentDatabase();
});

const entriesOfType = async (reference: string, type: ActivitySummary["type"]) => {
  const currentUser = await getCurrentUser();
  const detail = await getIssueDetail(reference, currentUser.identifier);
  return (detail?.activities ?? []).filter((activity) => activity.type === type);
};

describe("how an activity entry names the thing it is about", () => {
  signedInTest("names a label through its rename, and after it is deleted", async () => {
    const label = await createLabel({ name: "Needs triage", color: "#eb5757" });
    const issue = await createIssue({ title: "Issue that wore a label" });
    await setIssueLabels(issue.identifier, [label.identifier]);

    const labelInFeed = async () => {
      const [added] = await entriesOfType(issue.reference, "label_added");
      return nameOfActivitySubject(await listLabels(), added?.payload.labelIdentifier, added?.payload.labelName);
    };

    expect(await labelInFeed()).toBe("Needs triage");

    await updateLabel(label.identifier, { name: "Needs a decision" });
    expect(await labelInFeed()).toBe("Needs a decision");

    await deleteLabel(label.identifier);
    expect(await labelInFeed()).toBe("Needs triage");
  });

  signedInTest("names both ends of a status change through a rename, and after a deletion", async () => {
    await createWorkflowState({ name: "In review", type: "started", color: "#f2c94c" });
    const review = (await listStates()).find((state) => state.name === "In review");
    expect(review).toBeDefined();
    const issue = await createIssue({ title: "Issue that moved into review" });
    const origin = (await findIssueByReference(issue.reference))?.state;
    expect(origin).toBeDefined();

    await setIssueState(issue.identifier, review!.identifier);

    const moveInFeed = async () => {
      const [move] = await entriesOfType(issue.reference, "state_changed");
      const states = await listStates();
      return {
        from: nameOfActivitySubject(states, move?.payload.fromStateIdentifier, move?.payload.fromStateName),
        to: nameOfActivitySubject(states, move?.payload.toStateIdentifier, move?.payload.toStateName),
      };
    };

    expect(await moveInFeed()).toEqual({ from: origin!.name, to: "In review" });

    await updateWorkflowState(origin!.identifier, { name: "Fresh backlog" });
    await updateWorkflowState(review!.identifier, { name: "Under review" });
    expect(await moveInFeed()).toEqual({ from: "Fresh backlog", to: "Under review" });

    const replacement = (await listStates()).find((state) => state.type === "completed");
    expect(replacement).toBeDefined();
    await deleteWorkflowState(review!.identifier, replacement!.identifier);
    expect(await moveInFeed()).toEqual({ from: "Fresh backlog", to: "In review" });
  });

  signedInTest("names a milestone through its rename, and after it is deleted", async () => {
    const project = await createProject({ name: "Project with a renamed milestone" });
    const issue = await createIssue({ title: "Issue pinned to a milestone", projectIdentifier: project.identifier });
    await createMilestone(project.identifier, { name: "Phase one" });
    const [milestone] = (await getProjectDetail(project.identifier))?.milestones ?? [];
    expect(milestone).toBeDefined();
    await setIssueMilestone(issue.identifier, milestone!.identifier);

    const milestoneInFeed = async () => {
      const [pinned] = await entriesOfType(issue.reference, "milestone_changed");
      return nameOfActivitySubject(
        await listMilestoneNames(),
        pinned?.payload.toMilestoneIdentifier,
        pinned?.payload.toMilestoneName,
      );
    };

    expect(await milestoneInFeed()).toBe("Phase one");

    await updateMilestone(milestone!.identifier, { name: "Phase one, rescoped" });
    expect(await milestoneInFeed()).toBe("Phase one, rescoped");

    await deleteMilestone(milestone!.identifier);
    expect(await milestoneInFeed()).toBe("Phase one");
  });

  /**
   * A member is the exception: somebody who left the Discord server still has a
   * row, so "Former member" is their current name and wins over what the entry
   * recorded. Only a member removed outright is named by the recorded words.
   */
  signedInTest("names an assignee through their rename, and after they are removed", async () => {
    const database = await getDatabase();
    const workspace = await getWorkspace();
    const [assignee] = await database
      .insert(users)
      .values({
        workspaceIdentifier: workspace.identifier,
        name: "Assignee Before Renaming",
        displayName: "assignee-before-renaming",
        email: "assignee-before-renaming@acme.dev",
        avatarColor: "#5e6ad2",
        discordUserIdentifier: null,
      })
      .returning({ identifier: users.id });
    expect(assignee).toBeDefined();
    const issue = await createIssue({ title: "Issue handed to somebody who leaves" });
    await setIssueAssignee(issue.identifier, assignee!.identifier);

    const assigneeInFeed = async () => {
      const [assigned] = await entriesOfType(issue.reference, "assignee_changed");
      return nameOfMember(await listAllMembers(), assigned?.payload.toAssigneeIdentifier, assigned?.payload.toAssigneeName);
    };

    expect(await assigneeInFeed()).toBe("Assignee Before Renaming");

    await database
      .update(users)
      .set({ name: "Assignee After Renaming" })
      .where(eq(users.id, assignee!.identifier));
    expect(await assigneeInFeed()).toBe("Assignee After Renaming");

    await removeMember(assignee!.identifier);
    expect(await assigneeInFeed()).toBe("Assignee Before Renaming");
  });
});
