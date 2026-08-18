"use server";

import { and, eq, inArray, min, sql } from "drizzle-orm";
import { z } from "zod";

import { getDatabase, type Database } from "@/lib/database/client";
import { manualOrderBefore } from "@/lib/database/manual-order";
import {
  comments,
  issueLabels,
  issueRelations,
  issueRelationTypes,
  issueSubscriptions,
  issues,
  labels,
  projectMilestones,
  users,
  workflowStates,
  workspaces,
} from "@/lib/database/schema";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import {
  assertIssueAccessible,
  assertProjectAccessible,
  getProjectAccessContext,
  isIssueVisible,
  loadVisibleProjects,
  openAccessibleRow,
} from "@/lib/projects/access";
import { rescheduleIssueReminders } from "@/lib/reminders/dispatch";
import { action } from "@/lib/session/action";
import { memberNameColumns, nameOfMemberRow } from "@/lib/users/summary";
import type { ActionResult } from "@/lib/utilities/action-result";
import { revalidateEverything } from "@/lib/utilities/revalidate";
import {
  calendarDateSchema,
  commentBodySchema,
  identifierSchema,
  issueDescriptionSchema,
  issueEstimateSchema,
  issueTitleSchema,
  nullableIdentifierSchema,
  prioritySchema,
} from "@/lib/validation/schemas";
import { getWorkspace } from "@/lib/workspace/queries";

import {
  changeIssue,
  ensureSubscribed,
  notifyAssignee,
  notifySubscribers,
  openIssue,
  placeIssueInManualOrder,
  recordActivity,
  stateTimestamps,
  touchIssue,
  type ActivityEntry,
} from "./mutations";
import type { IssuePlacement } from "./placement";
import { formatIssueReference } from "./reference";
import { invertedRelationType } from "./types";

const createIssueSchema = z.object({
  title: issueTitleSchema,
  description: issueDescriptionSchema.nullable().default(null),
  stateIdentifier: nullableIdentifierSchema.default(null),
  priority: prioritySchema.default(0),
  assigneeIdentifier: nullableIdentifierSchema.default(null),
  labelIdentifiers: z.array(identifierSchema).default([]),
  projectIdentifier: nullableIdentifierSchema.default(null),
  parentIdentifier: nullableIdentifierSchema.default(null),
  estimate: issueEstimateSchema.default(null),
  dueDate: calendarDateSchema.nullable().default(null),
});

export type CreateIssueInput = z.input<typeof createIssueSchema>;

export type CreatedIssue = {
  readonly identifier: string;
  readonly reference: string;
};

const findMilestone = (database: Database, milestoneIdentifier: string) =>
  database.query.projectMilestones.findFirst({
    where: eq(projectMilestones.identifier, milestoneIdentifier),
    columns: { name: true, projectIdentifier: true },
  });

/**
 * Checks the milestone an issue is being moved to, and names it. It must be a
 * subdivision of *this* issue's project: the issue page reads the milestone
 * through a plain join with no access rule of its own, so one borrowed from a
 * restricted project would ride onto an issue everyone can read, carrying that
 * project's name and target date. Access is asked first and separately, so a
 * refusal does not depend on what the issue happens to be filed under.
 */
const openAccessibleMilestone = async (
  milestoneIdentifier: string | null,
  issueProjectIdentifier: string | null,
): Promise<string | null> => {
  if (milestoneIdentifier === null) {
    return null;
  }
  const database = await getDatabase();
  const milestone = await findMilestone(database, milestoneIdentifier);
  if (!milestone) {
    throw new NotFoundError("Milestone not found.");
  }
  await assertProjectAccessible(milestone.projectIdentifier);
  if (milestone.projectIdentifier !== issueProjectIdentifier) {
    throw new Error("That milestone belongs to another project.");
  }
  return milestone.name;
};

const nameOfCurrentMilestone = async (
  database: Database,
  milestoneIdentifier: string | null,
): Promise<string | null> =>
  milestoneIdentifier === null ? null : (await findMilestone(database, milestoneIdentifier))?.name ?? null;

const nameOfAssignee = async (
  database: Database,
  assigneeIdentifier: string | null,
): Promise<string | null> => {
  if (assigneeIdentifier === null) {
    return null;
  }
  const assignee = await database.query.users.findFirst({
    where: eq(users.id, assigneeIdentifier),
    columns: memberNameColumns,
  });
  return assignee ? nameOfMemberRow(assignee) : null;
};

export const createIssue = action(async (actor, rawInput: CreateIssueInput): Promise<CreatedIssue> => {
  const input = createIssueSchema.parse(rawInput);
  await assertProjectAccessible(input.projectIdentifier);
  if (input.parentIdentifier) {
    await assertIssueAccessible(input.parentIdentifier);
  }
  const [database, workspace] = await Promise.all([getDatabase(), getWorkspace()]);

  const created = await database.transaction(async (transaction) => {
    const [counter] = await transaction
      .update(workspaces)
      .set({ issueCounter: sql`${workspaces.issueCounter} + 1` })
      .where(eq(workspaces.identifier, workspace.identifier))
      .returning({ issueCounter: workspaces.issueCounter });
    if (!counter) {
      throw new Error("Workspace not found.");
    }

    const stateIdentifier =
      input.stateIdentifier ??
      (
        await transaction.query.workflowStates.findFirst({
          where: and(
            eq(workflowStates.workspaceIdentifier, workspace.identifier),
            inArray(workflowStates.type, ["backlog", "unstarted"]),
          ),
          orderBy: (state, { asc }) => [asc(state.position)],
          columns: { identifier: true },
        })
      )?.identifier;
    if (!stateIdentifier) {
      throw new Error("The workspace has no workflow states.");
    }
    const timestamps = await stateTimestamps(transaction, stateIdentifier);
    // A new issue starts at the top of both manual orders, which means below
    // every position already in use.
    const [lowestInUse] = await transaction
      .select({ sortOrder: min(issues.sortOrder), boardOrder: min(issues.boardOrder) })
      .from(issues)
      .where(eq(issues.workspaceIdentifier, workspace.identifier));

    const [issue] = await transaction
      .insert(issues)
      .values({
        workspaceIdentifier: workspace.identifier,
        number: counter.issueCounter,
        title: input.title,
        description: input.description,
        stateIdentifier,
        priority: input.priority,
        assigneeIdentifier: input.assigneeIdentifier,
        creatorIdentifier: actor.identifier,
        projectIdentifier: input.projectIdentifier,
        parentIdentifier: input.parentIdentifier,
        estimate: input.estimate,
        dueDate: input.dueDate,
        sortOrder: manualOrderBefore(lowestInUse?.sortOrder ?? null),
        boardOrder: manualOrderBefore(lowestInUse?.boardOrder ?? null),
        ...timestamps,
      })
      .returning({ identifier: issues.identifier });
    if (!issue) {
      throw new Error("Failed to create the issue.");
    }

    if (input.labelIdentifiers.length > 0) {
      await transaction.insert(issueLabels).values(
        input.labelIdentifiers.map((labelIdentifier) => ({ issueIdentifier: issue.identifier, labelIdentifier })),
      );
    }
    await recordActivity(transaction, issue.identifier, actor.identifier, { type: "created" });
    await ensureSubscribed(transaction, issue.identifier, actor.identifier);
    await notifyAssignee(transaction, issue.identifier, actor.identifier, input.assigneeIdentifier);
    return { identifier: issue.identifier, reference: formatIssueReference(counter.issueCounter) };
  });

  revalidateEverything();
  return created;
});

export const updateIssueTitle = action(async (_actor, issueIdentifier: string, title: string): Promise<void> => {
  const parsedTitle = issueTitleSchema.parse(title);
  const mutation = await openIssue(issueIdentifier);
  if (mutation.issue.title === parsedTitle) {
    return;
  }
  await changeIssue(mutation, { title: parsedTitle }, { type: "title_changed", from: mutation.issue.title, to: parsedTitle });
  revalidateEverything();
});

export const updateIssueDescription = action(async (_actor, issueIdentifier: string, description: string): Promise<void> => {
  const parsedDescription = issueDescriptionSchema.parse(description);
  const mutation = await openIssue(issueIdentifier);
  const nextDescription = parsedDescription.trim().length > 0 ? parsedDescription : null;
  if (mutation.issue.description === nextDescription) {
    return;
  }
  await changeIssue(
    mutation,
    { description: nextDescription },
    { type: "description_changed", from: mutation.issue.description },
  );
  revalidateEverything();
});

export const setIssueState = action(async (_actor, issueIdentifier: string, stateIdentifier: string): Promise<void> => {
  const parsedState = identifierSchema.parse(stateIdentifier);
  const mutation = await openIssue(issueIdentifier);
  const { database, currentUser, issue } = mutation;
  if (issue.stateIdentifier === parsedState) {
    return;
  }
  const nextState = await database.query.workflowStates.findFirst({
    where: eq(workflowStates.identifier, parsedState),
    columns: { name: true },
  });
  if (!nextState) {
    throw new Error("Workflow state not found.");
  }
  const timestamps = await stateTimestamps(database, parsedState);
  await changeIssue(
    mutation,
    { stateIdentifier: parsedState, ...timestamps },
    {
      type: "state_changed",
      fromStateIdentifier: issue.stateIdentifier,
      fromStateName: issue.state.name,
      toStateIdentifier: parsedState,
      toStateName: nextState.name,
    },
  );
  await notifySubscribers(database, issue.identifier, currentUser.identifier, "issue_state_changed");
  revalidateEverything();
});

export const setIssuePriority = action(async (_actor, issueIdentifier: string, priority: number): Promise<void> => {
  const parsedPriority = prioritySchema.parse(priority);
  const mutation = await openIssue(issueIdentifier);
  if (mutation.issue.priority === parsedPriority) {
    return;
  }
  await changeIssue(mutation, { priority: parsedPriority }, { type: "priority_changed", from: mutation.issue.priority, to: parsedPriority });
  revalidateEverything();
});

export const setIssueAssignee = action(async (_actor, issueIdentifier: string, assigneeIdentifier: string | null): Promise<void> => {
  const parsedAssignee = nullableIdentifierSchema.parse(assigneeIdentifier);
  const mutation = await openIssue(issueIdentifier);
  const { database, currentUser, issue } = mutation;
  if (issue.assigneeIdentifier === parsedAssignee) {
    return;
  }
  const nextAssigneeName = await nameOfAssignee(database, parsedAssignee);
  await changeIssue(
    mutation,
    { assigneeIdentifier: parsedAssignee },
    {
      type: "assignee_changed",
      fromAssigneeIdentifier: issue.assigneeIdentifier,
      fromAssigneeName: issue.assignee ? nameOfMemberRow(issue.assignee) : null,
      toAssigneeIdentifier: parsedAssignee,
      toAssigneeName: nextAssigneeName,
    },
  );
  await notifyAssignee(database, issue.identifier, currentUser.identifier, parsedAssignee);
  revalidateEverything();
});

export const setIssueLabels = action(async (_actor, issueIdentifier: string, labelIdentifiers: readonly string[]): Promise<void> => {
  const parsedLabels = z.array(identifierSchema).parse(labelIdentifiers);
  const { database, currentUser, issue } = await openIssue(issueIdentifier);
  const existing = await database.query.issueLabels.findMany({
    where: eq(issueLabels.issueIdentifier, issue.identifier),
    columns: { labelIdentifier: true },
  });
  const existingSet = new Set(existing.map((row) => row.labelIdentifier));
  const nextSet = new Set(parsedLabels);
  const added = parsedLabels.filter((identifier) => !existingSet.has(identifier));
  const removed = [...existingSet].filter((identifier) => !nextSet.has(identifier));
  if (added.length === 0 && removed.length === 0) {
    return;
  }
  // The words each entry records beside the identifier. A label being taken off
  // always has a row, because `issue_labels` holds a foreign key to it, so only
  // an identifier nobody ever created can miss.
  const changedLabels = await database.query.labels.findMany({
    where: inArray(labels.identifier, [...added, ...removed]),
    columns: { identifier: true, name: true },
  });
  const nameOfLabel = (labelIdentifier: string): string => {
    const label = changedLabels.find((candidate) => candidate.identifier === labelIdentifier);
    if (!label) {
      throw new NotFoundError("Label not found.");
    }
    return label.name;
  };
  await database.transaction(async (transaction) => {
    if (removed.length > 0) {
      await transaction
        .delete(issueLabels)
        .where(and(eq(issueLabels.issueIdentifier, issue.identifier), inArray(issueLabels.labelIdentifier, removed)));
    }
    if (added.length > 0) {
      await transaction.insert(issueLabels).values(added.map((labelIdentifier) => ({ issueIdentifier: issue.identifier, labelIdentifier })));
    }
    for (const labelIdentifier of added) {
      await recordActivity(transaction, issue.identifier, currentUser.identifier, {
        type: "label_added",
        labelIdentifier,
        labelName: nameOfLabel(labelIdentifier),
      });
    }
    for (const labelIdentifier of removed) {
      await recordActivity(transaction, issue.identifier, currentUser.identifier, {
        type: "label_removed",
        labelIdentifier,
        labelName: nameOfLabel(labelIdentifier),
      });
    }
    await touchIssue(transaction, issue.identifier);
  });
  revalidateEverything();
});

export const setIssueProject = action(async (_actor, issueIdentifier: string, projectIdentifier: string | null): Promise<void> => {
  const parsedProject = nullableIdentifierSchema.parse(projectIdentifier);
  await assertProjectAccessible(parsedProject);
  const mutation = await openIssue(issueIdentifier);
  if (mutation.issue.projectIdentifier === parsedProject) {
    return;
  }
  // A milestone belongs to the project it subdivides, so the move takes it —
  // a second thing the issue lost, which the feed has to account for.
  const clearedMilestone = await nameOfCurrentMilestone(mutation.database, mutation.issue.milestoneIdentifier);
  const clearedMilestoneEntry: readonly ActivityEntry[] =
    clearedMilestone === null
      ? []
      : [
          {
            type: "milestone_changed",
            fromMilestoneIdentifier: mutation.issue.milestoneIdentifier,
            fromMilestoneName: clearedMilestone,
            toMilestoneIdentifier: null,
            toMilestoneName: null,
          },
        ];
  await changeIssue(
    mutation,
    { projectIdentifier: parsedProject, milestoneIdentifier: null },
    {
      type: "project_changed",
      fromProjectIdentifier: mutation.issue.projectIdentifier,
      toProjectIdentifier: parsedProject,
    },
    ...clearedMilestoneEntry,
  );
  revalidateEverything();
});

export const setIssueMilestone = action(async (_actor, issueIdentifier: string, milestoneIdentifier: string | null): Promise<void> => {
  const parsedMilestone = nullableIdentifierSchema.parse(milestoneIdentifier);
  // The issue first: the milestone is checked against the project the issue is
  // filed under, and an unreachable issue is refused before the milestone is
  // named at all.
  const mutation = await openIssue(issueIdentifier);
  const nextMilestone = await openAccessibleMilestone(parsedMilestone, mutation.issue.projectIdentifier);
  if (mutation.issue.milestoneIdentifier === parsedMilestone) {
    return;
  }
  const previousMilestone = await nameOfCurrentMilestone(mutation.database, mutation.issue.milestoneIdentifier);
  await changeIssue(
    mutation,
    { milestoneIdentifier: parsedMilestone },
    {
      type: "milestone_changed",
      fromMilestoneIdentifier: mutation.issue.milestoneIdentifier,
      fromMilestoneName: previousMilestone,
      toMilestoneIdentifier: parsedMilestone,
      toMilestoneName: nextMilestone,
    },
  );
  revalidateEverything();
});

export const setIssueEstimate = action(async (_actor, issueIdentifier: string, estimate: number | null): Promise<void> => {
  const parsedEstimate = issueEstimateSchema.parse(estimate);
  const mutation = await openIssue(issueIdentifier);
  if (mutation.issue.estimate === parsedEstimate) {
    return;
  }
  await changeIssue(mutation, { estimate: parsedEstimate }, { type: "estimate_changed", from: mutation.issue.estimate, to: parsedEstimate });
  revalidateEverything();
});

export const setIssueDueDate = action(async (_actor, issueIdentifier: string, dueDate: string | null): Promise<void> => {
  const parsedDueDate = calendarDateSchema.nullable().parse(dueDate);
  const mutation = await openIssue(issueIdentifier);
  if (mutation.issue.dueDate === parsedDueDate) {
    return;
  }
  await changeIssue(mutation, { dueDate: parsedDueDate }, { type: "due_date_changed", from: mutation.issue.dueDate, to: parsedDueDate });
  await rescheduleIssueReminders(mutation.database, mutation.issue.identifier);
  revalidateEverything();
});

export const setIssueParent = action(async (_actor, issueIdentifier: string, parentIdentifier: string | null): Promise<void> => {
  const parsedParent = nullableIdentifierSchema.parse(parentIdentifier);
  const mutation = await openIssue(issueIdentifier);
  if (parsedParent === mutation.issue.identifier) {
    throw new Error("An issue cannot be its own parent.");
  }
  if (parsedParent) {
    await assertIssueAccessible(parsedParent);
  }
  await changeIssue(mutation, { parentIdentifier: parsedParent }, { type: "parent_changed", to: parsedParent });
  revalidateEverything();
});

/**
 * Whoever filed it, or an admin: project access only asks whether the actor may
 * *see* the issue, which is a different question from being allowed to end it.
 *
 * Nothing here is recoverable and nothing here is only the actor's — `on delete
 * cascade` takes every comment, reminder and activity entry other people wrote,
 * plus the relation rows held on the issue at the other end of each relation,
 * which lose them with no entry in their own feed saying so.
 */
export const deleteIssue = action(async (actor, issueIdentifier: string): Promise<void> => {
  const { database, issue } = await openIssue(issueIdentifier);
  if (issue.creatorIdentifier !== actor.identifier && !actor.isAdmin) {
    throw new ForbiddenError("Only the issue's creator or an admin can delete an issue.");
  }
  await database.delete(issues).where(eq(issues.identifier, issue.identifier));
  revalidateEverything();
});

const issuePlacementSchema = z.object({
  aboveIssueIdentifier: nullableIdentifierSchema,
  belowIssueIdentifier: nullableIdentifierSchema,
});

/**
 * A card dropped on the board: where it landed in the board's order, and the
 * status of the column it landed in when that column stands for a status.
 *
 * The board is ordered by `board_order` under every grouping, so every drop
 * writes that column and only that column, never the list's `sort_order`. The
 * status is null when the column stands for something else, whose property the
 * action that owns it has already set.
 */
export const moveIssueOnBoard = action(async (
  _actor,
  issueIdentifier: string,
  stateIdentifier: string | null,
  rawPlacement: IssuePlacement,
): Promise<void> => {
  const placement = issuePlacementSchema.parse(rawPlacement);
  const mutation = await openIssue(issueIdentifier);
  await placeIssueInManualOrder(mutation.database, "board", mutation.issue, placement);
  if (stateIdentifier !== null) {
    await setIssueState(mutation.issue.identifier, stateIdentifier);
  }
  revalidateEverything();
});

/**
 * The same drop in a list, which is ordered by `sort_order`. Nothing drags a
 * list today, but this is the only writer of the order every list's Manual
 * ordering reads, and the column a board drop must not touch.
 */
export const reorderIssue = action(async (_actor, issueIdentifier: string, rawPlacement: IssuePlacement): Promise<void> => {
  const placement = issuePlacementSchema.parse(rawPlacement);
  const { database, issue } = await openIssue(issueIdentifier);
  await placeIssueInManualOrder(database, "list", issue, placement);
  revalidateEverything();
});

const deletedCommentMessage = "That comment was deleted.";

/**
 * The parent a reply names arrives from the browser, so it has to be a comment
 * on the issue being replied to and one that still has a body: the row a
 * deleted comment leaves behind holds the replies already written under it,
 * not new ones.
 */
const assertReplyableParent = async (
  database: Database,
  issueIdentifier: string,
  parentIdentifier: string | null,
): Promise<void> => {
  if (parentIdentifier === null) {
    return;
  }
  const parent = await database.query.comments.findFirst({
    where: eq(comments.identifier, parentIdentifier),
    columns: { issueIdentifier: true, deletedAt: true },
  });
  if (!parent || parent.issueIdentifier !== issueIdentifier) {
    throw new NotFoundError("Comment not found.");
  }
  if (parent.deletedAt !== null) {
    throw new NotFoundError(deletedCommentMessage);
  }
};

export const addComment = action(async (
  _actor,
  issueIdentifier: string,
  body: string,
  parentCommentIdentifier: string | null = null,
): Promise<void> => {
  const parsedBody = commentBodySchema.parse(body);
  const parsedParent = nullableIdentifierSchema.parse(parentCommentIdentifier);
  const { database, currentUser, issue } = await openIssue(issueIdentifier);
  await assertReplyableParent(database, issue.identifier, parsedParent);
  await database.transaction(async (transaction) => {
    const [comment] = await transaction
      .insert(comments)
      .values({ issueIdentifier: issue.identifier, authorIdentifier: currentUser.identifier, body: parsedBody, parentIdentifier: parsedParent })
      .returning({ identifier: comments.identifier });
    if (!comment) {
      throw new Error("Failed to add the comment.");
    }
    await recordActivity(transaction, issue.identifier, currentUser.identifier, {
      type: "commented",
      commentIdentifier: comment.identifier,
    });
    await ensureSubscribed(transaction, issue.identifier, currentUser.identifier);
    await touchIssue(transaction, issue.identifier);
    await notifySubscribers(transaction, issue.identifier, currentUser.identifier, "issue_commented", comment.identifier);
  });
  revalidateEverything();
});

/**
 * Loads a comment through its issue so project access applies, and with the
 * author, because seeing an issue and having written one of its comments are
 * different questions. A deleted one is refused here rather than in each
 * caller — its row outlives the deletion only to hold the replies underneath.
 */
const openComment = async (rawIdentifier: string) => {
  const opened = await openAccessibleRow(rawIdentifier, {
    load: (database, identifier) =>
      database.query.comments.findFirst({
        where: eq(comments.identifier, identifier),
        columns: { identifier: true, issueIdentifier: true, authorIdentifier: true, deletedAt: true },
      }),
    notFoundMessage: "Comment not found.",
    assertAccessible: (comment) => openIssue(comment.issueIdentifier),
  });
  if (opened.row.deletedAt !== null) {
    throw new NotFoundError(deletedCommentMessage);
  }
  return opened;
};

export const editComment = action(async (actor, commentIdentifier: string, body: string): Promise<void> => {
  const parsedBody = commentBodySchema.parse(body);
  const { database, row: comment } = await openComment(commentIdentifier);
  if (comment.authorIdentifier !== actor.identifier) {
    throw new ForbiddenError("Only the author can edit a comment.");
  }
  await database
    .update(comments)
    .set({ body: parsedBody, editedAt: new Date(), updatedAt: new Date() })
    .where(eq(comments.identifier, comment.identifier));
  revalidateEverything();
});

/**
 * A comment nobody has replied under is removed outright. One that has anything
 * hanging off it is only marked deleted, because `parent_identifier` cascades:
 * retracting your own words must not take away other people's answers.
 *
 * "Anything" is every child row and not only the ones still showing a body: a
 * reply that was itself deleted is holding replies of its own in place.
 */
export const deleteComment = action(async (actor, commentIdentifier: string): Promise<void> => {
  const { database, row: comment } = await openComment(commentIdentifier);
  if (comment.authorIdentifier !== actor.identifier && !actor.isAdmin) {
    throw new ForbiddenError("Only the author or an admin can delete a comment.");
  }
  const reply = await database.query.comments.findFirst({
    where: eq(comments.parentIdentifier, comment.identifier),
    columns: { identifier: true },
  });
  if (reply) {
    await database
      .update(comments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(comments.identifier, comment.identifier));
  } else {
    await database.delete(comments).where(eq(comments.identifier, comment.identifier));
  }
  revalidateEverything();
});

export const addIssueRelation = action(async (_actor, issueIdentifier: string, relatedIssueIdentifier: string, type: string): Promise<void> => {
  const parsedType = z.enum(issueRelationTypes).parse(type);
  const { database, currentUser, issue } = await openIssue(issueIdentifier);
  const related = await openIssue(relatedIssueIdentifier);
  if (issue.identifier === related.issue.identifier) {
    throw new Error("An issue cannot relate to itself.");
  }
  await database.transaction(async (transaction) => {
    await transaction
      .insert(issueRelations)
      .values({ issueIdentifier: issue.identifier, relatedIssueIdentifier: related.issue.identifier, type: parsedType })
      .onConflictDoNothing();
    await recordActivity(transaction, issue.identifier, currentUser.identifier, {
      type: "relation_added",
      relatedIssueIdentifier: related.issue.identifier,
      relationType: parsedType,
    });
    // One relation is a fact about two issues, so the other one's feed records
    // it too, from its end — which is the inverse.
    await recordActivity(transaction, related.issue.identifier, currentUser.identifier, {
      type: "relation_added",
      relatedIssueIdentifier: issue.identifier,
      relationType: invertedRelationType(parsedType),
    });
    await touchIssue(transaction, issue.identifier);
  });
  revalidateEverything();
});

/**
 * Removes a relation from both of the issues it was about: the ✕ is offered on
 * either one — the properties panel renders an incoming relation exactly like
 * an outgoing one — while the row itself names only one of them as its source.
 */
export const removeIssueRelation = action(async (_actor, relationIdentifier: string): Promise<void> => {
  const parsedRelation = identifierSchema.parse(relationIdentifier);
  const database = await getDatabase();
  const relation = await database.query.issueRelations.findFirst({ where: eq(issueRelations.identifier, parsedRelation) });
  if (!relation) {
    return;
  }
  const { currentUser, issue } = await openIssue(relation.issueIdentifier);
  const related = await openIssue(relation.relatedIssueIdentifier);
  await database.transaction(async (transaction) => {
    await transaction.delete(issueRelations).where(eq(issueRelations.identifier, parsedRelation));
    await recordActivity(transaction, issue.identifier, currentUser.identifier, {
      type: "relation_removed",
      relatedIssueIdentifier: related.issue.identifier,
      relationType: relation.type,
    });
    await recordActivity(transaction, related.issue.identifier, currentUser.identifier, {
      type: "relation_removed",
      relatedIssueIdentifier: issue.identifier,
      relationType: invertedRelationType(relation.type),
    });
  });
  revalidateEverything();
});

export const toggleIssueSubscription = action(async (_actor, issueIdentifier: string): Promise<boolean> => {
  const { database, currentUser, issue } = await openIssue(issueIdentifier);
  const subscription = and(
    eq(issueSubscriptions.issueIdentifier, issue.identifier),
    eq(issueSubscriptions.userIdentifier, currentUser.identifier),
  );
  const existing = await database.query.issueSubscriptions.findFirst({ where: subscription });
  if (existing) {
    await database.delete(issueSubscriptions).where(subscription);
  } else {
    await ensureSubscribed(database, issue.identifier, currentUser.identifier);
  }
  revalidateEverything();
  return !existing;
});

const bulkPatchSchema = z.object({
  stateIdentifier: identifierSchema.optional(),
  priority: prioritySchema.optional(),
  assigneeIdentifier: nullableIdentifierSchema.optional(),
  projectIdentifier: nullableIdentifierSchema.optional(),
});

export type BulkIssuePatch = z.input<typeof bulkPatchSchema>;

/**
 * How many of a batch the actor cannot change: gone since the list was drawn,
 * or filed in a project they cannot reach. Answered from one read of the
 * projects they can see rather than by opening each issue, because the point is
 * to know before the first write rather than partway through.
 */
const unreachableIssueCount = async (issueIdentifiers: readonly string[]): Promise<number> => {
  const [database, accessContext] = await Promise.all([getDatabase(), getProjectAccessContext()]);
  const [rows, visibleProjects] = await Promise.all([
    database.query.issues.findMany({
      where: inArray(issues.identifier, [...issueIdentifiers]),
      columns: { identifier: true, projectIdentifier: true },
    }),
    loadVisibleProjects(database, accessContext),
  ]);
  const reachable = new Set(
    rows
      .filter((row) => isIssueVisible(visibleProjects, row.projectIdentifier))
      .map((row) => row.identifier),
  );
  return issueIdentifiers.filter((identifier) => !reachable.has(identifier)).length;
};

/**
 * Applies one change to every issue in a batch, or to none of them. The setters
 * below each open their own issue and write in their own transaction, so
 * checking every identifier first is the only moment at which "nothing has
 * happened yet" is still true.
 *
 * The refusal comes back as a value because production masks the message a
 * thrown server action carries, and the bar has to say why nothing changed.
 */
export const bulkUpdateIssues = action(async (
  _actor,
  issueIdentifiers: readonly string[],
  rawPatch: BulkIssuePatch,
): Promise<ActionResult<void>> => {
  const parsedIssues = z.array(identifierSchema).min(1).parse(issueIdentifiers);
  const patch = bulkPatchSchema.parse(rawPatch);
  // Checked up front for the same reason: left to `setIssueProject` it would be
  // refused on the first issue, after the rest of the patch had been applied.
  if (patch.projectIdentifier !== undefined) {
    await assertProjectAccessible(patch.projectIdentifier);
  }
  const unreachableCount = await unreachableIssueCount(parsedIssues);
  if (unreachableCount > 0) {
    return {
      ok: false,
      error: `${unreachableCount} of the selected issues cannot be changed. Nothing was changed — reload the list and try again.`,
    };
  }
  for (const issueIdentifier of parsedIssues) {
    if (patch.stateIdentifier) {
      await setIssueState(issueIdentifier, patch.stateIdentifier);
    }
    if (patch.priority !== undefined) {
      await setIssuePriority(issueIdentifier, patch.priority);
    }
    if (patch.assigneeIdentifier !== undefined) {
      await setIssueAssignee(issueIdentifier, patch.assigneeIdentifier);
    }
    if (patch.projectIdentifier !== undefined) {
      await setIssueProject(issueIdentifier, patch.projectIdentifier);
    }
  }
  revalidateEverything();
  return { ok: true, value: undefined };
});
