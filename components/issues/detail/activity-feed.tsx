import Link from "next/link";
import type { ReactNode } from "react";

import { Markdown } from "@/components/markdown/markdown";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Timestamp } from "@/components/ui/timestamp";
import { nameOfActivitySubject } from "@/lib/issues/activity-subject";
import type { ActivitySummary, CommentSummary } from "@/lib/issues/detail-queries";
import { priorityName } from "@/lib/issues/priority";
import { issuePathForReference } from "@/lib/issues/reference";
import type { IssueRelationSummary } from "@/lib/issues/types";
import { listMilestoneNames, listProjectSummaries } from "@/lib/projects/queries";
import { listLabels } from "@/lib/labels/queries";
import { listAllMembers } from "@/lib/users/queries";
import { nameOfMember } from "@/lib/users/summary";
import { listStates } from "@/lib/workflow/queries";

import { CommentCard } from "./comment-card";
import { type RenderedReply } from "./comment-replies";
import { DeletedCommentCard } from "./deleted-comment-card";

type ActivityFeedProps = {
  readonly issueIdentifier: string;
  readonly activities: readonly ActivitySummary[];
  readonly comments: readonly CommentSummary[];
  readonly relations: readonly IssueRelationSummary[];
};

type FeedEntry =
  | { readonly kind: "activity"; readonly activity: ActivitySummary; readonly at: Date }
  | { readonly kind: "comment"; readonly comment: CommentSummary; readonly at: Date };

type PayloadValue = string | number | null | undefined;

const relationLabel: Readonly<Record<IssueRelationSummary["type"], string>> = {
  blocks: "marked as blocking",
  blocked_by: "marked as blocked by",
  related: "related to",
  duplicate: "marked as duplicate of",
};

/**
 * Rendered on the server; comment and reply bodies are handed to the client
 * cards as already-rendered Markdown.
 *
 * Names come from the whole roster, past members included: an issue's history
 * outlives the people in it.
 */
export const ActivityFeed = async ({ issueIdentifier, activities, comments, relations }: ActivityFeedProps) => {
  const [members, labels, states, milestones, projects] = await Promise.all([
    listAllMembers(),
    listLabels(),
    listStates(),
    listMilestoneNames(),
    listProjectSummaries(),
  ]);

  const describe = (activity: ActivitySummary): ReactNode => {
    const payload = activity.payload;
    const labelName = (identifier: PayloadValue, nameAtTheTime: PayloadValue) =>
      nameOfActivitySubject(labels, identifier, nameAtTheTime) ?? "a label";
    const stateName = (identifier: PayloadValue, nameAtTheTime: PayloadValue) =>
      nameOfActivitySubject(states, identifier, nameAtTheTime) ?? "—";
    const milestoneName = (identifier: PayloadValue, nameAtTheTime: PayloadValue) =>
      nameOfActivitySubject(milestones, identifier, nameAtTheTime) ?? "a milestone";
    const projectName = (identifier: PayloadValue) =>
      typeof identifier === "string"
        ? projects.find((project) => project.identifier === identifier)?.name ?? "a project"
        : null;
    const strong = (text: ReactNode) => <span className="font-medium text-foreground">{text}</span>;

    switch (activity.type) {
      case "created":
        return <>created the issue</>;
      case "title_changed":
        return <>changed the title to {strong(String(payload.to ?? ""))}</>;
      case "description_changed":
        return <>updated the description</>;
      case "state_changed":
        return (
          <>
            changed status from {strong(stateName(payload.fromStateIdentifier, payload.fromStateName))} to{" "}
            {strong(stateName(payload.toStateIdentifier, payload.toStateName))}
          </>
        );
      case "priority_changed":
        return <>set priority to {strong(priorityName(Number(payload.to ?? 0)))}</>;
      case "assignee_changed":
        return payload.toAssigneeIdentifier ? (
          <>assigned to {strong(nameOfMember(members, payload.toAssigneeIdentifier, payload.toAssigneeName))}</>
        ) : (
          <>removed the assignee</>
        );
      case "label_added":
        return <>added label {strong(labelName(payload.labelIdentifier, payload.labelName))}</>;
      case "label_removed":
        return <>removed label {strong(labelName(payload.labelIdentifier, payload.labelName))}</>;
      case "project_changed": {
        // The exception on `nameOfActivitySubject`: identifiers only, and "a
        // project" for one this reader cannot open as much as for one that is gone.
        const name = projectName(payload.toProjectIdentifier);
        return name ? <>added to project {strong(name)}</> : <>removed from project</>;
      }
      case "milestone_changed":
        return payload.toMilestoneIdentifier ? (
          <>set the milestone to {strong(milestoneName(payload.toMilestoneIdentifier, payload.toMilestoneName))}</>
        ) : (
          <>removed the milestone</>
        );
      case "estimate_changed":
        return payload.to === null || payload.to === undefined ? (
          <>removed the estimate</>
        ) : (
          <>set estimate to {strong(String(payload.to))}</>
        );
      case "due_date_changed":
        return payload.to ? <>set due date to {strong(String(payload.to))}</> : <>removed the due date</>;
      case "parent_changed":
        return payload.to ? <>set the parent issue</> : <>removed the parent issue</>;
      case "relation_added": {
        const relation = relations.find(
          (candidate) => candidate.issue.identifier === payload.relatedIssueIdentifier,
        );
        const type = String(payload.relationType ?? "related");
        return (
          <>
            {relationLabel[type as IssueRelationSummary["type"]] ?? "related to"}{" "}
            {relation ? (
              <Link href={issuePathForReference(relation.issue.reference)} className="font-medium text-foreground hover:underline">
                {relation.issue.reference}
              </Link>
            ) : (
              "an issue"
            )}
          </>
        );
      }
      case "relation_removed":
        return <>removed a relation</>;
      case "commented":
        return null;
    }
  };

  const activityEntries: FeedEntry[] = activities
    .filter((activity) => activity.type !== "commented")
    .map((activity) => ({ kind: "activity", activity, at: activity.createdAt }));
  const commentEntries: FeedEntry[] = comments
    .filter((comment) => comment.parentIdentifier === null)
    .map((comment) => ({ kind: "comment", comment, at: comment.createdAt }));
  const entries = [...activityEntries, ...commentEntries].sort((left, right) => left.at.getTime() - right.at.getTime());

  const repliesOf = (commentIdentifier: string): readonly RenderedReply[] =>
    comments
      .filter((comment) => comment.parentIdentifier === commentIdentifier)
      .map((comment) => ({
        comment,
        renderedBody: comment.status === "visible" ? <Markdown source={comment.body} className="mt-1" /> : null,
      }));

  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry) =>
        entry.kind === "comment" ? (
          <li key={`comment-${entry.comment.identifier}`}>
            {entry.comment.status === "visible" ? (
              <CommentCard
                issueIdentifier={issueIdentifier}
                comment={entry.comment}
                renderedBody={<Markdown source={entry.comment.body} />}
                replies={repliesOf(entry.comment.identifier)}
              />
            ) : (
              <DeletedCommentCard replies={repliesOf(entry.comment.identifier)} />
            )}
          </li>
        ) : (
          <li key={`activity-${entry.activity.identifier}`} className="flex items-center gap-3 pl-0.5 text-xs text-foreground-tertiary">
            {entry.activity.actor ? (
              <Avatar name={entry.activity.actor.name} color={entry.activity.actor.avatarColor} image={entry.activity.actor.image} size={18} />
            ) : (
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-background-tertiary">
                <Icon name="activity" size={10} />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium text-foreground-secondary">
                {nameOfMember(members, entry.activity.actor?.identifier)}
              </span>{" "}
              {describe(entry.activity)}
            </span>
            <Timestamp value={entry.activity.createdAt} format="relative" className="shrink-0 text-foreground-quaternary" />
          </li>
        ),
      )}
    </ol>
  );
};
