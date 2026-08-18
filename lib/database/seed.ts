import { eq, inArray } from "drizzle-orm";

import { defaultWorkspaceName, defaultWorkspaceSlug } from "@/lib/workspace/defaults";

import type { Database } from "./client";
import {
  commentBodySeeds,
  issueTitleSeeds,
  memberSeeds,
  projectSeeds,
  workspaceLabelSeeds,
} from "./seed-fixtures";
import {
  comments,
  issueActivities,
  issueLabels,
  issueRelations,
  issueSubscriptions,
  issues,
  labels,
  notifications,
  projectMembers,
  projectMilestones,
  projectUpdates,
  projects,
  users,
  workspaces,
} from "./schema";
import { ensureWorkflowStates } from "@/lib/workflow/defaults";

/** Deterministic pseudo random generator so the seed is reproducible. */
const createRandom = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

const random = createRandom(20260816);

const pick = <T>(candidates: readonly T[]): T => {
  const chosen = candidates[Math.floor(random() * candidates.length)];
  if (chosen === undefined) {
    throw new Error("Cannot pick from an empty list.");
  }
  return chosen;
};

const maybe = (probability: number): boolean => random() < probability;

const daysFromNow = (days: number): Date => {
  const result = new Date();
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

const hoursAgo = (hours: number): Date =>
  new Date(Date.now() - hours * 60 * 60 * 1000);

/**
 * The Discord application and server a development database points at. It
 * belongs to whoever is running it, so it comes from `.env.development.local`
 * rather than being committed; unset means `/setup` fills it in.
 */
const developmentIdentity = () => {
  const value = (name: string) => process.env[name]?.trim() || null;
  return {
    discordGuildIdentifier: value("SEED_DISCORD_GUILD_ID"),
    discordClientIdentifier: value("SEED_DISCORD_CLIENT_ID"),
    authBaseUrl: value("SEED_APP_URL"),
  };
};

export const seedWorkspace = async (database: Database): Promise<string> => {
  const [workspace] = await database
    .insert(workspaces)
    .values({
      name: defaultWorkspaceName,
      slug: defaultWorkspaceSlug,
      ...developmentIdentity(),
    })
    .returning({ identifier: workspaces.identifier });
  if (!workspace) {
    throw new Error("Failed to insert the seed workspace.");
  }
  await ensureWorkflowStates(database, workspace.identifier);
  return workspace.identifier;
};

/**
 * Invents a small team for development databases with no Discord server to
 * mirror. The workspace takes a demo identity to match.
 */
export const seedSampleMembers = async (
  database: Database,
  workspaceIdentifier: string,
): Promise<readonly string[]> => {
  await database
    .update(workspaces)
    .set({ name: "Acme", slug: "acme" })
    .where(eq(workspaces.identifier, workspaceIdentifier));
  const insertedUsers = await database
    .insert(users)
    .values(memberSeeds.map((member) => ({ ...member, workspaceIdentifier })))
    .returning({ identifier: users.id });
  return insertedUsers.map((user) => user.identifier);
};

export const seedSampleData = async (
  database: Database,
  workspaceIdentifier: string,
  memberIdentifiers: readonly string[],
): Promise<void> => {
  const workspace = { identifier: workspaceIdentifier };
  const userIdentifiers = [...memberIdentifiers];
  const [firstMemberIdentifier] = userIdentifiers;
  if (!firstMemberIdentifier) {
    throw new Error("Cannot seed sample data without members.");
  }

  const insertedLabels = await database
    .insert(labels)
    .values(
      workspaceLabelSeeds.map((label) => ({
        ...label,
        workspaceIdentifier: workspace.identifier,
      })),
    )
    .returning({ identifier: labels.identifier, name: labels.name });
  const labelIdentifiers = insertedLabels.map((label) => label.identifier);

  // The workflow belongs to the workspace, not to the sample data.
  const states = await ensureWorkflowStates(database, workspace.identifier);

  const seededProjectIdentifiers: string[] = [];
  const projectMilestoneIdentifiers = new Map<string, readonly string[]>();
  for (const [projectIndex, projectSeed] of projectSeeds.entries()) {
    const leadIdentifier =
      userIdentifiers[projectIndex % userIdentifiers.length];
    const [project] = await database
      .insert(projects)
      .values({
        workspaceIdentifier: workspace.identifier,
        name: projectSeed.name,
        icon: projectSeed.icon,
        color: projectSeed.color,
        status: projectSeed.status,
        health: projectSeed.health,
        description: projectSeed.description,
        leadIdentifier,
        startDate:
          projectSeed.startOffsetDays === null
            ? null
            : isoDate(daysFromNow(projectSeed.startOffsetDays)),
        targetDate:
          projectSeed.targetOffsetDays === null
            ? null
            : isoDate(daysFromNow(projectSeed.targetOffsetDays)),
        sortOrder: projectIndex,
      })
      .returning({ identifier: projects.identifier });
    if (!project) {
      throw new Error(`Failed to insert seed project ${projectSeed.name}.`);
    }
    seededProjectIdentifiers.push(project.identifier);

    await database.insert(projectMembers).values(
      userIdentifiers.slice(0, 3 + (projectIndex % 3)).map((userIdentifier) => ({
        projectIdentifier: project.identifier,
        userIdentifier,
      })),
    );

    const milestones = await database
      .insert(projectMilestones)
      .values([
        {
          projectIdentifier: project.identifier,
          name: "Design complete",
          targetDate: isoDate(daysFromNow(-7 + projectIndex * 3)),
          sortOrder: 0,
        },
        {
          projectIdentifier: project.identifier,
          name: "Internal beta",
          targetDate: isoDate(daysFromNow(7 + projectIndex * 3)),
          sortOrder: 1,
        },
        {
          projectIdentifier: project.identifier,
          name: "General availability",
          targetDate: isoDate(daysFromNow(21 + projectIndex * 3)),
          sortOrder: 2,
        },
      ])
      .returning({ identifier: projectMilestones.identifier });
    projectMilestoneIdentifiers.set(
      project.identifier,
      milestones.map((milestone) => milestone.identifier),
    );

    if (projectSeed.health) {
      await database.insert(projectUpdates).values({
        projectIdentifier: project.identifier,
        authorIdentifier: leadIdentifier ?? firstMemberIdentifier,
        health: projectSeed.health,
        body:
          projectSeed.health === "at_risk"
            ? "Velocity dropped this week because two engineers were on incident duty. Scope is unchanged; target may slip a week."
            : "On track. Core flows are complete and we are polishing edge cases before the internal beta.",
        createdAt: hoursAgo(30),
      });
    }
  }

  const stateNamesForRandomIssue = [
    "Backlog",
    "Backlog",
    "Todo",
    "Todo",
    "In Progress",
    "In Progress",
    "In Review",
    "Done",
    "Done",
    "Done",
    "Canceled",
  ] as const;

  const insertedIssueIdentifiers: string[] = [];

  for (const [titleIndex, title] of issueTitleSeeds.entries()) {
    const number = titleIndex + 1;
    const stateName = pick(stateNamesForRandomIssue);
    const stateIdentifier = states.get(stateName);
    if (!stateIdentifier) {
      throw new Error(`Seed state ${stateName} missing.`);
    }

    const isCompleted = stateName === "Done";
    const projectIdentifier =
      titleIndex < 21
        ? seededProjectIdentifiers[Math.floor(titleIndex / 4)]
        : maybe(0.4)
          ? pick(seededProjectIdentifiers)
          : null;
    const milestoneCandidates = projectIdentifier
      ? projectMilestoneIdentifiers.get(projectIdentifier)
      : undefined;
    const createdAt = hoursAgo(24 * (2 + Math.floor(random() * 40)));

    const [issue] = await database
      .insert(issues)
      .values({
        workspaceIdentifier: workspace.identifier,
        number,
        title,
        description: maybe(0.7)
          ? `${title}.\n\n## Context\n\nThis came up while testing the ${
              projectIdentifier ? "project" : "workspace"
            } workflow end to end. See the linked discussion for details.\n\n## Acceptance criteria\n\n- [ ] Behavior matches the spec\n- [ ] Covered by tests\n- [ ] Documented in the changelog`
          : null,
        priority: pick([0, 1, 2, 2, 3, 3, 3, 4] as const),
        stateIdentifier,
        assigneeIdentifier: maybe(0.2) ? null : pick(userIdentifiers),
        creatorIdentifier: pick(userIdentifiers),
        projectIdentifier,
        milestoneIdentifier:
          milestoneCandidates && maybe(0.6) ? pick(milestoneCandidates) : null,
        estimate: maybe(0.6) ? pick([1, 2, 3, 5, 8] as const) : null,
        dueDate: maybe(0.3)
          ? isoDate(daysFromNow(Math.floor(random() * 30) - 5))
          : null,
        sortOrder: titleIndex,
        boardOrder: titleIndex,
        completedAt: isCompleted ? hoursAgo(24) : null,
        createdAt,
        updatedAt: hoursAgo(Math.floor(random() * 48)),
      })
      .returning({ identifier: issues.identifier });
    if (!issue) {
      throw new Error(`Failed to insert seed issue "${title}".`);
    }
    insertedIssueIdentifiers.push(issue.identifier);

    const labelCount = Math.floor(random() * 3);
    const chosenLabels = new Set<string>();
    for (let index = 0; index < labelCount; index += 1) {
      chosenLabels.add(pick(labelIdentifiers));
    }
    if (chosenLabels.size > 0) {
      await database.insert(issueLabels).values(
        [...chosenLabels].map((labelIdentifier) => ({
          issueIdentifier: issue.identifier,
          labelIdentifier,
        })),
      );
    }

    await database.insert(issueActivities).values({
      issueIdentifier: issue.identifier,
      actorIdentifier: pick(userIdentifiers),
      type: "created",
      payload: {},
      createdAt,
    });

    if (maybe(0.5)) {
      const commentAuthor = pick(userIdentifiers);
      const [comment] = await database
        .insert(comments)
        .values({
          issueIdentifier: issue.identifier,
          authorIdentifier: commentAuthor,
          body: pick(commentBodySeeds),
          createdAt: hoursAgo(Math.floor(random() * 40)),
        })
        .returning({ identifier: comments.identifier });
      if (comment && maybe(0.4)) {
        await database.insert(comments).values({
          issueIdentifier: issue.identifier,
          authorIdentifier: pick(userIdentifiers),
          parentIdentifier: comment.identifier,
          body: pick(commentBodySeeds),
          createdAt: hoursAgo(Math.floor(random() * 20)),
        });
      }
    }

    await database.insert(issueSubscriptions).values(
      [...new Set([firstMemberIdentifier, pick(userIdentifiers)])].map(
        (userIdentifier) => ({
          issueIdentifier: issue.identifier,
          userIdentifier,
        }),
      ),
    );
  }

  const [firstEngineeringIssue, secondEngineeringIssue, thirdEngineeringIssue] =
    insertedIssueIdentifiers;
  if (firstEngineeringIssue && secondEngineeringIssue && thirdEngineeringIssue) {
    await database
      .update(issues)
      .set({ parentIdentifier: firstEngineeringIssue })
      .where(
        inArray(issues.identifier, [
          secondEngineeringIssue,
          thirdEngineeringIssue,
        ]),
      );
    await database.insert(issueRelations).values([
      {
        issueIdentifier: secondEngineeringIssue,
        relatedIssueIdentifier: thirdEngineeringIssue,
        type: "blocks",
      },
      {
        issueIdentifier: firstEngineeringIssue,
        relatedIssueIdentifier: insertedIssueIdentifiers[20] ?? thirdEngineeringIssue,
        type: "related",
      },
    ]);
  }

  // Every member gets the same handful, so the inbox is populated for whoever
  // signs in — with a real Discord team there is no way to know who that is.
  await database.insert(notifications).values(
    userIdentifiers.flatMap((recipientIdentifier, memberIndex) =>
      insertedIssueIdentifiers.slice(0, 6).map((issueIdentifier, index) => ({
        userIdentifier: recipientIdentifier,
        // Offset by the recipient so nobody is notified about their own doing.
        actorIdentifier: userIdentifiers[(memberIndex + index + 1) % userIdentifiers.length],
        issueIdentifier,
        type: pick(["issue_assigned", "issue_commented", "issue_state_changed"] as const),
        readAt: index > 3 ? hoursAgo(2) : null,
        createdAt: hoursAgo(index * 5 + 1),
      })),
    ),
  );

  await database
    .update(workspaces)
    .set({ issueCounter: issueTitleSeeds.length })
    .where(eq(workspaces.identifier, workspace.identifier));
};
