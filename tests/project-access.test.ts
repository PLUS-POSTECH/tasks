import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { accessMenuRoles } from "@/components/projects/project-access-roles";
import { getDatabase } from "@/lib/database/client";
import { seedDevelopmentDatabase } from "@/lib/database/development";
import { users } from "@/lib/database/schema";
import {
  addIssueRelation,
  bulkUpdateIssues,
  createIssue,
  setIssueAssignee,
  setIssueMilestone,
  setIssueParent,
  setIssueProject,
  setIssueState,
} from "@/lib/issues/actions";
import { getIssueDetail } from "@/lib/issues/detail-queries";
import { emptyIssueFilter, everyIssueScope, resolveIssueFilter } from "@/lib/issues/filters";
import { findIssueByReference, listIssues } from "@/lib/issues/queries";
import { runOperation } from "@/lib/operations/registry";
import { canAccessProject } from "@/lib/projects/access";
import {
  createMilestone,
  createProject,
  deleteProject,
  setProjectAccessRoles,
  toggleProjectMember,
  updateProject,
} from "@/lib/projects/actions";
import { getProjectDetail, listProjects, listProjectSummaries } from "@/lib/projects/queries";
import { countUnreadNotifications, listNotifications } from "@/lib/notifications/queries";
import { getCurrentUser } from "@/lib/session/current-user";
import { listAllMembers } from "@/lib/users/queries";
import { listStates } from "@/lib/workflow/queries";

import { actingAs, signedInTest } from "./act-as";

const roleIdentifier = "123456789012345678";

const projectIssueCount = async (userIdentifier: string, projectIdentifier: string): Promise<number> =>
  (
    await listIssues(
      { ...everyIssueScope, projectIdentifiers: [projectIdentifier] },
      resolveIssueFilter(emptyIssueFilter, userIdentifier),
    )
  ).length;

beforeAll(async () => {
  await seedDevelopmentDatabase();
});

describe("project access by Discord role", () => {
  signedInTest("restricting a project hides it and its issues from members without the role", async () => {
    const projects = await listProjects();
    const members = await listAllMembers();
    const project = projects.find((candidate) => candidate.progress.total > 0);
    expect(project).toBeDefined();
    if (!project) {
      return;
    }
    const detail = await getProjectDetail(project.identifier);
    const outsider = members.find(
      (member) =>
        !member.isAdmin &&
        member.identifier !== project.lead?.identifier &&
        !detail?.members.some((projectMember) => projectMember.identifier === member.identifier),
    );
    expect(outsider).toBeDefined();
    if (!outsider) {
      return;
    }

    await setProjectAccessRoles(project.identifier, [{ identifier: roleIdentifier, name: "Core team" }]);
    expect((await getProjectDetail(project.identifier))?.accessRoles).toEqual([
      { identifier: roleIdentifier, name: "Core team" },
    ]);

    await actingAs(outsider.identifier, async () => {
      expect((await listProjects()).some((candidate) => candidate.identifier === project.identifier)).toBe(false);
      expect((await listProjectSummaries()).some((candidate) => candidate.identifier === project.identifier)).toBe(false);
      expect(await getProjectDetail(project.identifier)).toBeNull();
      expect(await canAccessProject(project.identifier)).toBe(false);
      expect(await projectIssueCount(outsider.identifier, project.identifier)).toBe(0);
      await expect(
        createIssue({ title: "Sneaky issue", projectIdentifier: project.identifier }),
      ).rejects.toThrow("You do not have access to this project.");
      await expect(
        setProjectAccessRoles(project.identifier, []),
      ).rejects.toThrow("You do not have access to this project.");
    });

    const database = await getDatabase();
    await database
      .update(users)
      .set({ discordRoleIdentifiers: [roleIdentifier], discordRolesSyncedAt: new Date() })
      .where(eq(users.id, outsider.identifier));
    await actingAs(outsider.identifier, async () => {
      expect(await canAccessProject(project.identifier)).toBe(true);
      expect((await listProjects()).some((candidate) => candidate.identifier === project.identifier)).toBe(true);
      expect(await projectIssueCount(outsider.identifier, project.identifier)).toBe(project.progress.total);
      // Holding the role grants access but not the right to change who has it.
      await expect(setProjectAccessRoles(project.identifier, [])).rejects.toThrow(
        "Only admins and the project lead can change project access.",
      );
    });

    await setProjectAccessRoles(project.identifier, []);
    await database
      .update(users)
      .set({ discordRoleIdentifiers: [], discordRolesSyncedAt: new Date() })
      .where(eq(users.id, outsider.identifier));
    await actingAs(outsider.identifier, async () => {
      expect(await canAccessProject(project.identifier)).toBe(true);
    });
  });

  // The sidebar badge and the inbox answer the same question, so a badge
  // reading 3 over an empty inbox is a number nobody can clear.
  signedInTest("the unread badge counts only the notifications the inbox shows", async () => {
    const currentUser = await getCurrentUser();
    const members = await listAllMembers();
    const outsider = members.find(
      (member) => !member.isAdmin && member.identifier !== currentUser.identifier,
    );
    expect(outsider).toBeDefined();
    if (!outsider) {
      return;
    }

    const project = await createProject({ name: "Badge project" });
    const issue = await createIssue({ title: "Badge issue", projectIdentifier: project.identifier });
    // Assigning it is what tells them about it.
    await setIssueAssignee(issue.identifier, outsider.identifier);

    const unreadWhileVisible = await actingAs(outsider.identifier, async () => {
      const visible = await listNotifications(outsider.identifier, "inbox");
      expect(visible.some((notification) => notification.issue?.identifier === issue.identifier)).toBe(true);
      const unread = await countUnreadNotifications(outsider.identifier);
      expect(unread).toBe(visible.filter((notification) => notification.readAt === null).length);
      return unread;
    });

    await setProjectAccessRoles(project.identifier, [{ identifier: roleIdentifier, name: "Core team" }]);

    await actingAs(outsider.identifier, async () => {
      const stillVisible = await listNotifications(outsider.identifier, "inbox");
      expect(stillVisible.some((notification) => notification.issue?.identifier === issue.identifier)).toBe(false);
      expect(await countUnreadNotifications(outsider.identifier)).toBe(unreadWhileVisible - 1);
      expect(await countUnreadNotifications(outsider.identifier)).toBe(
        stillVisible.filter((notification) => notification.readAt === null).length,
      );
    });
  });
});

/**
 * The rule the suite above pins is "holding the role grants access but not the
 * right to change who has it". These are the other doors into the same room: the
 * lead, the member list, deleting the project, and reads that mention an issue.
 */
describe("the back doors into a restricted project", () => {
  /** A role no other test grants, so these tests only move their own members. */
  const coreTeamRole = { identifier: "223456789012345678", name: "Core team" };
  const roleGrants = new Set<string>();

  const setDiscordRoles = async (userIdentifier: string, roleIdentifiers: readonly string[]): Promise<void> => {
    const database = await getDatabase();
    roleGrants.add(userIdentifier);
    await database
      .update(users)
      .set({ discordRoleIdentifiers: roleIdentifiers, discordRolesSyncedAt: new Date() })
      .where(eq(users.id, userIdentifier));
  };

  const ordinaryMemberIdentifiers = async (): Promise<readonly string[]> =>
    (await listAllMembers())
      .filter((member) => !member.isAdmin && !member.hasLeft)
      .map((member) => member.identifier);

  type RestrictedProject = {
    readonly projectIdentifier: string;
    readonly issue: { readonly identifier: string; readonly reference: string };
    readonly roleHolder: string;
    readonly outsider: string;
  };

  const restrictedProjectWithAnIssue = async (name: string): Promise<RestrictedProject> => {
    const [roleHolder, outsider] = await ordinaryMemberIdentifiers();
    expect(roleHolder).toBeDefined();
    expect(outsider).toBeDefined();
    await setDiscordRoles(roleHolder!, [coreTeamRole.identifier]);
    await setDiscordRoles(outsider!, []);
    const project = await createProject({ name });
    const issue = await createIssue({ title: `${name} issue`, projectIdentifier: project.identifier });
    await setProjectAccessRoles(project.identifier, [coreTeamRole]);
    return { projectIdentifier: project.identifier, issue, roleHolder: roleHolder!, outsider: outsider! };
  };

  afterAll(async () => {
    const database = await getDatabase();
    for (const userIdentifier of roleGrants) {
      await database
        .update(users)
        .set({ discordRoleIdentifiers: [], discordRolesSyncedAt: new Date() })
        .where(eq(users.id, userIdentifier));
    }
  });

  signedInTest("deleting a project is not a member's to do, and never declassifies its issues", async () => {
    const { projectIdentifier, issue, roleHolder, outsider } = await restrictedProjectWithAnIssue("Confidential programme");

    await actingAs(outsider, async () => {
      expect(await findIssueByReference(issue.reference)).toBeNull();
      await expect(deleteProject(projectIdentifier)).rejects.toThrow("You do not have access to this project.");
    });

    await actingAs(roleHolder, async () => {
      expect(await canAccessProject(projectIdentifier)).toBe(true);
      await expect(deleteProject(projectIdentifier)).rejects.toThrow(
        "Only admins and the project lead can delete a project.",
      );
    });

    // Not even an admin deletes it while issues still point at it: the issues are
    // `on delete set null` and the role rows cascade away, so the delete would
    // publish them with nothing left to say they were restricted.
    await expect(deleteProject(projectIdentifier)).rejects.toThrow("This project still has 1 issue.");

    await actingAs(outsider, async () => {
      expect(await findIssueByReference(issue.reference)).toBeNull();
    });

    await setIssueProject(issue.identifier, null);
    await deleteProject(projectIdentifier);
    expect((await listProjects()).some((project) => project.identifier === projectIdentifier)).toBe(false);
  });

  signedInTest("nobody makes themselves the lead, which is what the access guard is written in terms of", async () => {
    const { projectIdentifier, roleHolder, outsider } = await restrictedProjectWithAnIssue("Role-gated programme");

    await actingAs(roleHolder, async () => {
      await expect(setProjectAccessRoles(projectIdentifier, [])).rejects.toThrow(
        "Only admins and the project lead can change project access.",
      );
      await expect(updateProject(projectIdentifier, { leadIdentifier: roleHolder })).rejects.toThrow(
        "Only admins and the project lead can change the project lead.",
      );
      // `projects.update` over the operations API and MCP is this same action, so it
      // cannot be the way around it.
      await expect(
        runOperation("projects.update", { identifier: projectIdentifier, leadIdentifier: roleHolder }),
      ).rejects.toThrow("Only admins and the project lead can change the project lead.");
      await updateProject(projectIdentifier, { status: "started" });
    });

    const restricted = await getProjectDetail(projectIdentifier);
    expect(restricted?.lead).toBeNull();
    expect(restricted?.status).toBe("started");
    expect(restricted?.accessRoles).toEqual([coreTeamRole]);
    await actingAs(outsider, async () => {
      expect(await canAccessProject(projectIdentifier)).toBe(false);
    });

    // The other direction: an open project nobody leads is not up for grabs
    // either, or a member could take it over and lock everyone else out.
    const open = await createProject({ name: "Shared programme" });
    await actingAs(outsider, async () => {
      await expect(updateProject(open.identifier, { leadIdentifier: outsider })).rejects.toThrow(
        "Only admins and the project lead can change the project lead.",
      );
      await expect(setProjectAccessRoles(open.identifier, [coreTeamRole])).rejects.toThrow(
        "Only admins and the project lead can change project access.",
      );
    });
    const stillOpen = await getProjectDetail(open.identifier);
    expect(stillOpen?.lead).toBeNull();
    expect(stillOpen?.accessRoles).toEqual([]);
  });

  signedInTest("a member who can see a restricted project cannot enrol anyone into it", async () => {
    const { projectIdentifier, issue, roleHolder, outsider } = await restrictedProjectWithAnIssue("Embargoed programme");

    await actingAs(roleHolder, async () => {
      await expect(toggleProjectMember(projectIdentifier, outsider)).rejects.toThrow(
        "Only admins and the project lead can change who is on a project.",
      );
    });

    await actingAs(outsider, async () => {
      expect(await canAccessProject(projectIdentifier)).toBe(false);
      expect(await findIssueByReference(issue.reference)).toBeNull();
    });

    await toggleProjectMember(projectIdentifier, outsider);
    await actingAs(outsider, async () => {
      expect(await canAccessProject(projectIdentifier)).toBe(true);
      expect((await findIssueByReference(issue.reference))?.identifier).toBe(issue.identifier);
    });
  });

  signedInTest("a restricted issue is not named by the issues that point at it", async () => {
    const [, outsider] = await ordinaryMemberIdentifiers();
    expect(outsider).toBeDefined();
    await setDiscordRoles(outsider!, []);
    const currentUser = await getCurrentUser();
    const secret = await createProject({ name: "Confidential neighbours" });
    const visible = await createIssue({ title: "Open issue with hidden neighbours" });
    const hiddenParent = await createIssue({ title: "Hidden parent", projectIdentifier: secret.identifier });
    const hiddenSibling = await createIssue({ title: "Hidden sibling", projectIdentifier: secret.identifier });
    await createIssue({
      title: "Hidden child",
      projectIdentifier: secret.identifier,
      parentIdentifier: visible.identifier,
    });
    const finishedChild = await createIssue({
      title: "Hidden finished child",
      projectIdentifier: secret.identifier,
      parentIdentifier: visible.identifier,
    });
    const completed = (await listStates()).find((state) => state.type === "completed");
    expect(completed).toBeDefined();
    await setIssueState(finishedChild.identifier, completed!.identifier);
    await setIssueParent(visible.identifier, hiddenParent.identifier);
    await addIssueRelation(visible.identifier, hiddenSibling.identifier, "related");
    await setProjectAccessRoles(secret.identifier, [coreTeamRole]);

    const asAdmin = await getIssueDetail(visible.reference, currentUser.identifier);
    expect(asAdmin?.issue.parent?.title).toBe("Hidden parent");
    expect(asAdmin?.issue.subIssueCount).toBe(2);
    expect(asAdmin?.issue.completedSubIssueCount).toBe(1);
    expect(asAdmin?.relations).toHaveLength(1);

    await actingAs(outsider!, async () => {
      const detail = await getIssueDetail(visible.reference, outsider!);
      expect(detail?.issue.title).toBe("Open issue with hidden neighbours");
      expect(detail?.issue.parent).toBeNull();
      expect(detail?.relations).toEqual([]);
      // A count labels the list under it, and that list is empty: "2, of which 1 is
      // done" over no rows is the whole leak.
      expect(detail?.subIssues).toEqual([]);
      expect(detail?.issue.subIssueCount).toBe(0);
      expect(detail?.issue.completedSubIssueCount).toBe(0);
      expect(JSON.stringify(detail)).not.toContain("Hidden");

      const [row] = await listIssues(
        { ...everyIssueScope, issueIdentifiers: [visible.identifier] },
        resolveIssueFilter(emptyIssueFilter, outsider!),
      );
      expect(row?.parent).toBeNull();
      expect(row?.subIssueCount).toBe(0);
      expect(row?.completedSubIssueCount).toBe(0);
    });
  });

  /**
   * The block icon is the same kind of claim as the sub-issue counts above: the
   * detail query strips relations whose other end is out of reach, so a red icon
   * over an empty section says an issue they cannot see is in their way.
   */
  signedInTest("a blocker in a restricted project does not light the block icon", async () => {
    const { projectIdentifier, outsider } = await restrictedProjectWithAnIssue("Sealed blockers");
    const currentUser = await getCurrentUser();
    const open = await createIssue({ title: "Open issue with hidden blockers" });
    // Both directions a block can be written in, because the count reads the
    // relation from either end.
    const blocking = await createIssue({ title: "Hidden blocker", projectIdentifier });
    const blockedBy = await createIssue({ title: "Hidden blocker, other way round", projectIdentifier });
    await addIssueRelation(blocking.identifier, open.identifier, "blocks");
    await addIssueRelation(open.identifier, blockedBy.identifier, "blocked_by");

    expect((await getIssueDetail(open.reference, currentUser.identifier))?.issue.isBlocked).toBe(true);

    await actingAs(outsider, async () => {
      const detail = await getIssueDetail(open.reference, outsider);
      expect(detail?.relations).toEqual([]);
      expect(detail?.issue.isBlocked).toBe(false);

      const [row] = await listIssues(
        { ...everyIssueScope, issueIdentifiers: [open.identifier] },
        resolveIssueFilter(emptyIssueFilter, outsider),
      );
      expect(row?.isBlocked).toBe(false);
    });
  });

  signedInTest("a milestone of a project the actor cannot see cannot be pinned on one they can", async () => {
    const { projectIdentifier, outsider } = await restrictedProjectWithAnIssue("Sealed roadmap");
    await createMilestone(projectIdentifier, { name: "Sealed milestone", targetDate: "2031-03-01" });
    const milestone = (await getProjectDetail(projectIdentifier))?.milestones[0];
    expect(milestone).toBeDefined();
    const open = await createIssue({ title: "Open issue with no milestone" });

    await actingAs(outsider, async () => {
      await expect(setIssueMilestone(open.identifier, milestone!.identifier)).rejects.toThrow(
        "You do not have access to this project.",
      );
      const detail = await getIssueDetail(open.reference, outsider);
      expect(detail?.milestone).toBeNull();
    });
  });

  /**
   * A bulk control is handed identifiers rather than a query, and the loop that
   * spends them opens each issue in turn — so one the actor cannot reach must
   * refuse the batch rather than stop in the middle of it.
   */
  signedInTest("refuses a whole bulk update rather than applying the reachable part of it", async () => {
    const { issue: sealed, outsider } = await restrictedProjectWithAnIssue("Sealed batch");
    const open = await createIssue({ title: "Open issue caught in a batch" });

    await actingAs(outsider, async () => {
      // The reachable issue is named first, so anything applied before the
      // refusal is reached shows up on it.
      const result = await bulkUpdateIssues([open.identifier, sealed.identifier], { priority: 1 });
      expect(result.ok).toBe(false);
      expect((await getIssueDetail(open.reference, outsider))?.issue.priority).toBe(0);
    });
  });
});

/**
 * A role deleted on the Discord server keeps restricting every project it was
 * stored on, and the menu that lifts the restriction is built from the roles
 * Discord still returns — so a stored role is offered under its stored name.
 */
describe("a project restricted to a role the server no longer has", () => {
  const coreTeam = { id: "900000000000000001", name: "Core team", color: 0x5865f2, position: 3, permissions: "0" };

  test("still offers the stored role, marked as gone from the server", () => {
    const offered = accessMenuRoles(
      [
        { identifier: coreTeam.id, name: "Core team" },
        { identifier: "900000000000000002", name: "Alumni" },
      ],
      [coreTeam],
    );

    expect(offered.filter((role) => role.identifier === coreTeam.id)).toEqual([
      { identifier: coreTeam.id, name: "Core team", onServer: true, color: coreTeam.color },
    ]);
    expect(offered.find((role) => role.identifier === "900000000000000002")).toEqual({
      identifier: "900000000000000002",
      name: "Alumni",
      onServer: false,
    });
  });

  test("offers the server's roles even where the project is restricted to none", () => {
    expect(accessMenuRoles([], [coreTeam])).toEqual([
      { identifier: coreTeam.id, name: "Core team", onServer: true, color: coreTeam.color },
    ]);
  });
});
