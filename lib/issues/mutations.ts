import { and, eq, inArray, sql } from "drizzle-orm";

import { getDatabase, type Database } from "@/lib/database/client";
import { manualOrderBetween } from "@/lib/database/manual-order";
import { NotFoundError } from "@/lib/errors";
import {
  issueActivities,
  issueSubscriptions,
  issues,
  notifications,
  projectMilestones,
  workflowStates,
  type ActivityType,
  type IssueRelationType,
} from "@/lib/database/schema";
import { assertProjectAccessible } from "@/lib/projects/access";
import { getCurrentUser, type CurrentUser } from "@/lib/session/current-user";
import { memberNameColumns } from "@/lib/users/summary";
import { identifierSchema } from "@/lib/validation/schemas";

import type { IssuePlacement } from "./placement";

/**
 * The row a mutation works on, with the state, assignee and reporter it may
 * replace. Each is the "before" half of an activity pair and does not survive
 * the update, so all are read here rather than by the actions that record them.
 */
const loadOpenedIssue = (database: Database, identifier: string) =>
  database.query.issues.findFirst({
    where: eq(issues.identifier, identifier),
    with: {
      state: { columns: { name: true } },
      assignee: { columns: memberNameColumns },
      creator: { columns: memberNameColumns },
    },
  });

export type OpenedIssue = NonNullable<Awaited<ReturnType<typeof loadOpenedIssue>>>;

export type IssueMutation = {
  readonly database: Database;
  readonly currentUser: CurrentUser;
  readonly issue: OpenedIssue;
};

export const openIssue = async (rawIdentifier: string): Promise<IssueMutation> => {
  const identifier = identifierSchema.parse(rawIdentifier);
  const [database, currentUser] = await Promise.all([getDatabase(), getCurrentUser()]);
  const issue = await loadOpenedIssue(database, identifier);
  if (!issue) {
    throw new NotFoundError("Issue not found.");
  }
  await assertProjectAccessible(issue.projectIdentifier);
  return { database, currentUser, issue };
};

type NothingRecorded = Readonly<Record<never, never>>;

/**
 * What each kind of activity records. Every activity type needs an entry. An
 * entry that names something names it twice — `<subject>Identifier` and the
 * `<subject>Name` it wore at the time — and every writer must supply both
 * halves.
 *
 * `project_changed` deliberately records no words and must stay that way; the
 * entries that name issues are the same case. See `nameOfActivitySubject`.
 */
type ActivityRecord = {
  readonly created: NothingRecorded;
  readonly title_changed: { readonly from: string; readonly to: string };
  /**
   * Only the text that was replaced: what it became is on the issue itself, and
   * a description runs to 50,000 characters.
   */
  readonly description_changed: { readonly from: string | null };
  readonly state_changed: {
    readonly fromStateIdentifier: string;
    readonly fromStateName: string;
    readonly toStateIdentifier: string;
    readonly toStateName: string;
  };
  readonly priority_changed: { readonly from: number; readonly to: number };
  readonly assignee_changed: {
    readonly fromAssigneeIdentifier: string | null;
    readonly fromAssigneeName: string | null;
    readonly toAssigneeIdentifier: string | null;
    readonly toAssigneeName: string | null;
  };
  readonly reporter_changed: {
    readonly fromReporterIdentifier: string | null;
    readonly fromReporterName: string | null;
    readonly toReporterIdentifier: string;
    readonly toReporterName: string;
  };
  readonly label_added: { readonly labelIdentifier: string; readonly labelName: string };
  readonly label_removed: { readonly labelIdentifier: string; readonly labelName: string };
  readonly project_changed: {
    readonly fromProjectIdentifier: string | null;
    readonly toProjectIdentifier: string | null;
  };
  readonly milestone_changed: {
    readonly fromMilestoneIdentifier: string | null;
    readonly fromMilestoneName: string | null;
    readonly toMilestoneIdentifier: string | null;
    readonly toMilestoneName: string | null;
  };
  readonly estimate_changed: { readonly from: number | null; readonly to: number | null };
  readonly due_date_changed: { readonly from: string | null; readonly to: string | null };
  readonly parent_changed: { readonly to: string | null };
  readonly relation_added: {
    readonly relatedIssueIdentifier: string;
    readonly relationType: IssueRelationType;
  };
  readonly relation_removed: {
    readonly relatedIssueIdentifier: string;
    readonly relationType: IssueRelationType;
  };
  readonly commented: { readonly commentIdentifier: string };
};

export type ActivityEntry = {
  [Type in ActivityType]: { readonly type: Type } & ActivityRecord[Type];
}[ActivityType];

export const recordActivity = async (
  database: Database,
  issueIdentifier: string,
  actorIdentifier: string,
  entry: ActivityEntry,
): Promise<void> => {
  const { type, ...payload } = entry;
  await database.insert(issueActivities).values({ issueIdentifier, actorIdentifier, type, payload });
};

export const touchIssue = async (database: Database, issueIdentifier: string): Promise<void> => {
  await database.update(issues).set({ updatedAt: new Date() }).where(eq(issues.identifier, issueIdentifier));
};

type IssuePatch = Partial<Omit<typeof issues.$inferInsert, "identifier" | "workspaceIdentifier" | "number">>;

export const changeIssue = async (
  { database, currentUser, issue }: IssueMutation,
  patch: IssuePatch,
  ...activities: readonly [ActivityEntry, ...(readonly ActivityEntry[])]
): Promise<void> => {
  await database.transaction(async (transaction) => {
    await transaction
      .update(issues)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(issues.identifier, issue.identifier));
    for (const activity of activities) {
      await recordActivity(transaction, issue.identifier, currentUser.identifier, activity);
    }
  });
};

/**
 * Records the milestone every issue filed under one of these is about to lose.
 * `issues.milestone_identifier` is `on delete set null`, so none of them passes
 * through `setIssueMilestone`. Must run inside the deleting transaction and
 * before the delete, which is the column the issues are found through.
 */
export const recordMilestonesCleared = async (
  database: Database,
  actorIdentifier: string,
  milestoneIdentifiers: readonly string[],
): Promise<void> => {
  if (milestoneIdentifiers.length === 0) {
    return;
  }
  const affected = await database
    .select({
      issueIdentifier: issues.identifier,
      milestoneIdentifier: projectMilestones.identifier,
      milestoneName: projectMilestones.name,
    })
    .from(issues)
    .innerJoin(projectMilestones, eq(projectMilestones.identifier, issues.milestoneIdentifier))
    .where(inArray(issues.milestoneIdentifier, [...milestoneIdentifiers]));
  for (const { issueIdentifier, milestoneIdentifier, milestoneName } of affected) {
    await recordActivity(database, issueIdentifier, actorIdentifier, {
      type: "milestone_changed",
      fromMilestoneIdentifier: milestoneIdentifier,
      fromMilestoneName: milestoneName,
      toMilestoneIdentifier: null,
      toMilestoneName: null,
    });
  }
};

/**
 * A board is ordered by `board_order` under every grouping and a list by
 * `sort_order`; everything below is the same work on whichever column.
 */
const manualOrders = {
  list: { column: issues.sortOrder, patch: (position: number) => ({ sortOrder: position }) },
  board: { column: issues.boardOrder, patch: (position: number) => ({ boardOrder: position }) },
} as const;

export type IssueManualOrder = keyof typeof manualOrders;

/**
 * Renumbers one manual order as 1..n, keeping the order the rows are in, so
 * that every neighbouring pair has whole numbers between them again.
 *
 * The whole workspace, because each order is a single sequence over it: a board
 * column or a list group is a subset picked out in the browser, and the server
 * is never told how the reader grouped them. The ordering ends on the issue
 * number so that rows tied on the position do not shuffle between runs.
 */
const renumberManualOrder = async (
  database: Database,
  order: IssueManualOrder,
  workspaceIdentifier: string,
): Promise<void> => {
  const { column } = manualOrders[order];
  await database.execute(sql`
    update ${issues}
    set ${sql.identifier(column.name)} = "renumbered"."position"
    from (
      select
        ${issues.identifier} as "identifier",
        row_number() over (
          order by ${column} asc, ${issues.createdAt} desc, ${issues.number} asc
        ) as "position"
      from ${issues}
      where ${eq(issues.workspaceIdentifier, workspaceIdentifier)}
    ) as "renumbered"
    where ${issues.identifier} = "renumbered"."identifier"
  `);
};

/**
 * Puts an issue between the two rows a drop named. The position is worked out
 * here because here is the only place the neighbours' stored positions can be
 * read, and because each of the two orders is its own column.
 *
 * When the gap between the neighbours has closed the order is renumbered and
 * the position taken again, both in one transaction.
 */
export const placeIssueInManualOrder = async (
  database: Database,
  order: IssueManualOrder,
  issue: { readonly identifier: string; readonly workspaceIdentifier: string },
  placement: IssuePlacement,
): Promise<void> => {
  if (placement.aboveIssueIdentifier === null && placement.belowIssueIdentifier === null) {
    // Alone in its column, a card has nothing to sit between: moving it in the
    // order every column shares would move it under every other grouping too.
    return;
  }
  const { column, patch } = manualOrders[order];
  await database.transaction(async (transaction) => {
    const neighbourPosition = async (identifier: string | null): Promise<number | null> => {
      // A neighbour deleted since the page rendered constrains nothing, and
      // neither does the dragged issue named as its own neighbour.
      if (identifier === null || identifier === issue.identifier) {
        return null;
      }
      const [neighbour] = await transaction
        .select({ position: column })
        .from(issues)
        .where(
          and(eq(issues.identifier, identifier), eq(issues.workspaceIdentifier, issue.workspaceIdentifier)),
        );
      return neighbour?.position ?? null;
    };
    const neighbourPositions = async (): Promise<readonly [number | null, number | null]> => [
      await neighbourPosition(placement.aboveIssueIdentifier),
      await neighbourPosition(placement.belowIssueIdentifier),
    ];
    const write = async (position: number): Promise<void> => {
      await transaction.update(issues).set(patch(position)).where(eq(issues.identifier, issue.identifier));
    };

    const [above, below] = await neighbourPositions();
    if (above === null && below === null) {
      return;
    }
    const position = manualOrderBetween(above, below);
    if (position !== null) {
      await write(position);
      return;
    }

    await renumberManualOrder(transaction, order, issue.workspaceIdentifier);
    const [renumberedAbove, renumberedBelow] = await neighbourPositions();
    const renumberedPosition = manualOrderBetween(renumberedAbove, renumberedBelow);
    if (renumberedPosition === null) {
      // Unreachable: renumbering leaves whole numbers between every pair.
      throw new Error("Renumbering the manual order left no room between the neighbours.");
    }
    await write(renumberedPosition);
  });
};

export const ensureSubscribed = async (database: Database, issueIdentifier: string, userIdentifier: string): Promise<void> => {
  await database.insert(issueSubscriptions).values({ issueIdentifier, userIdentifier }).onConflictDoNothing();
};

export const notifySubscribers = async (
  database: Database,
  issueIdentifier: string,
  actorIdentifier: string,
  type: "issue_commented" | "issue_state_changed",
  commentIdentifier: string | null = null,
): Promise<void> => {
  const subscribers = await database.query.issueSubscriptions.findMany({
    where: eq(issueSubscriptions.issueIdentifier, issueIdentifier),
    columns: { userIdentifier: true },
  });
  const recipients = subscribers
    .map((subscription) => subscription.userIdentifier)
    .filter((userIdentifier) => userIdentifier !== actorIdentifier);
  if (recipients.length === 0) {
    return;
  }
  await database.insert(notifications).values(
    recipients.map((userIdentifier) => ({ userIdentifier, actorIdentifier, issueIdentifier, commentIdentifier, type })),
  );
};

export const notifyAssignee = async (
  database: Database,
  issueIdentifier: string,
  actorIdentifier: string,
  assigneeIdentifier: string | null,
): Promise<void> => {
  if (!assigneeIdentifier || assigneeIdentifier === actorIdentifier) {
    return;
  }
  await ensureSubscribed(database, issueIdentifier, assigneeIdentifier);
  await database.insert(notifications).values({
    userIdentifier: assigneeIdentifier,
    actorIdentifier,
    issueIdentifier,
    type: "issue_assigned",
  });
};

/**
 * Always written, so an issue leaving a completed state stops claiming to have
 * been completed.
 */
export type StateTimestampsPatch = {
  readonly completedAt: Date | null;
};

export const stateTimestamps = async (database: Database, stateIdentifier: string): Promise<StateTimestampsPatch> => {
  const state = await database.query.workflowStates.findFirst({
    where: eq(workflowStates.identifier, stateIdentifier),
    columns: { type: true },
  });
  if (!state) {
    throw new NotFoundError("Workflow state not found.");
  }
  return { completedAt: state.type === "completed" ? new Date() : null };
};
