import { asc, eq } from "drizzle-orm";
import { cache } from "react";

import { getDatabase } from "@/lib/database/client";
import {
  issueActivities,
  issueSubscriptions,
  issues,
  projectMilestones,
  type ActivityType,
} from "@/lib/database/schema";

import { isIssueVisible } from "@/lib/projects/access";
import { milestoneDisplayOrder } from "@/lib/projects/queries";
import { listIssueReminders, type IssueReminderSummary } from "@/lib/reminders/queries";
import { formatIssueReference, parseIssueReference } from "./reference";
import {
  accessibleIssues,
  issueListCounts,
  issueListWith,
  issueReadAccess,
  listIssues,
  toIssueListItem,
} from "./queries";
import { invertedRelationType, type IssueListItem, type IssueRelationSummary } from "./types";
import type { UserSummary } from "@/lib/users/types";
import { emptyIssueFilter, everyIssueScope, resolveIssueFilter } from "./filters";
import { toOptionalUserSummary, toUserSummary, userSummaryColumns } from "@/lib/users/summary";
import { issueStateSummaryColumns } from "@/lib/workflow/queries";

/**
 * A deleted comment is a separate shape rather than a flag on the same one: its
 * row is kept so the replies written under it keep their place, while the body
 * and the author never leave the server.
 */
export type CommentSummary =
  | {
      readonly status: "visible";
      readonly identifier: string;
      readonly body: string;
      readonly author: UserSummary | null;
      readonly parentIdentifier: string | null;
      readonly createdAt: Date;
      readonly editedAt: Date | null;
    }
  | {
      readonly status: "deleted";
      readonly identifier: string;
      readonly parentIdentifier: string | null;
      readonly createdAt: Date;
    };

export type VisibleCommentSummary = Extract<CommentSummary, { readonly status: "visible" }>;

export type ActivitySummary = {
  readonly identifier: string;
  readonly type: ActivityType;
  readonly actor: UserSummary | null;
  readonly payload: Readonly<Record<string, string | number | null>>;
  readonly createdAt: Date;
};

export type MilestoneSummary = {
  readonly identifier: string;
  readonly name: string;
  readonly targetDate: string | null;
};

export type IssueDetail = {
  readonly issue: IssueListItem;
  readonly description: string | null;
  readonly milestone: MilestoneSummary | null;
  readonly projectMilestones: readonly MilestoneSummary[];
  readonly subIssues: readonly IssueListItem[];
  readonly relations: readonly IssueRelationSummary[];
  readonly comments: readonly CommentSummary[];
  readonly activities: readonly ActivitySummary[];
  readonly subscribers: readonly UserSummary[];
  readonly isSubscribed: boolean;
  readonly reminders: readonly IssueReminderSummary[];
};


export const getIssueDetail = cache(
  async (reference: string, currentUserIdentifier: string): Promise<IssueDetail | null> => {
    const issueNumber = parseIssueReference(reference);
    if (issueNumber === null) {
      return null;
    }
    const database = await getDatabase();
    const access = await issueReadAccess(database);

    const row = await database.query.issues.findFirst({
      where: accessibleIssues(database, eq(issues.number, issueNumber), access),
      with: {
        ...issueListWith,
        milestone: { columns: { identifier: true, name: true, targetDate: true } },
        comments: {
          orderBy: (comment, { asc: ascending }) => [ascending(comment.createdAt)],
          with: { author: { columns: userSummaryColumns } },
        },
        activities: {
          orderBy: [asc(issueActivities.createdAt)],
          with: { actor: { columns: userSummaryColumns } },
        },
        // Both ends carry their project so a relation naming an issue the
        // actor may not see can be dropped below.
        outgoingRelations: {
          with: {
            relatedIssue: {
              columns: { identifier: true, number: true, title: true, projectIdentifier: true },
              with: { state: { columns: issueStateSummaryColumns } },
            },
          },
        },
        incomingRelations: {
          with: {
            issue: {
              columns: { identifier: true, number: true, title: true, projectIdentifier: true },
              with: { state: { columns: issueStateSummaryColumns } },
            },
          },
        },
      },
      extras: issueListCounts(database, access.context),
    });
    if (!row) {
      return null;
    }
    const issue = toIssueListItem(row, access.visibleProjects);

    const [subIssues, milestones, subscriptions, reminders] = await Promise.all([
      listIssues(
        { ...everyIssueScope, parentIdentifier: issue.identifier },
        resolveIssueFilter(emptyIssueFilter, currentUserIdentifier),
      ),
      issue.project
        ? database.query.projectMilestones.findMany({
            where: eq(projectMilestones.projectIdentifier, issue.project.identifier),
            orderBy: [...milestoneDisplayOrder],
            columns: { identifier: true, name: true, targetDate: true },
          })
        : Promise.resolve([]),
      database.query.issueSubscriptions.findMany({
        where: eq(issueSubscriptions.issueIdentifier, issue.identifier),
        with: { user: { columns: userSummaryColumns } },
      }),
      listIssueReminders(issue.identifier),
    ]);

    const toCommentSummary = (comment: (typeof row.comments)[number]): CommentSummary =>
      comment.deletedAt === null
        ? {
            status: "visible",
            identifier: comment.identifier,
            body: comment.body,
            author: toOptionalUserSummary(comment.author),
            parentIdentifier: comment.parentIdentifier,
            createdAt: comment.createdAt,
            editedAt: comment.editedAt,
          }
        : {
            status: "deleted",
            identifier: comment.identifier,
            parentIdentifier: comment.parentIdentifier,
            createdAt: comment.createdAt,
          };

    const relations: readonly IssueRelationSummary[] = [
      ...row.outgoingRelations.map((relation) => ({
        identifier: relation.identifier,
        type: relation.type,
        issue: relation.relatedIssue,
      })),
      ...row.incomingRelations.map((relation) => ({
        identifier: relation.identifier,
        type: invertedRelationType(relation.type),
        issue: relation.issue,
      })),
    ]
      .filter((relation) => isIssueVisible(access.visibleProjects, relation.issue.projectIdentifier))
      .map((relation) => ({
        identifier: relation.identifier,
        type: relation.type,
        issue: {
          identifier: relation.issue.identifier,
          reference: formatIssueReference(relation.issue.number),
          title: relation.issue.title,
          state: relation.issue.state,
        },
      }));

    return {
      issue,
      description: row.description,
      milestone: row.milestone,
      projectMilestones: milestones,
      subIssues,
      relations,
      comments: row.comments.map(toCommentSummary),
      activities: row.activities.map((activity) => ({
        identifier: activity.identifier,
        type: activity.type,
        actor: toOptionalUserSummary(activity.actor),
        payload: activity.payload,
        createdAt: activity.createdAt,
      })),
      reminders,
      subscribers: subscriptions.map((subscription) => toUserSummary(subscription.user)),
      isSubscribed: subscriptions.some(
        (subscription) => subscription.userIdentifier === currentUserIdentifier,
      ),
    };
  },
);

