"use client";

import Link from "next/link";
import { useTransition, type ReactNode } from "react";

import { AssigneePicker } from "@/components/issues/pickers/assignee-picker";
import { DueDatePicker } from "@/components/issues/pickers/due-date-picker";
import { EstimatePicker } from "@/components/issues/pickers/estimate-picker";
import { IssueSearchPicker } from "@/components/issues/pickers/issue-search-picker";
import { LabelPicker } from "@/components/issues/pickers/label-picker";
import { MilestonePicker } from "@/components/issues/pickers/milestone-picker";
import { PriorityPicker } from "@/components/issues/pickers/priority-picker";
import { ProjectPicker } from "@/components/issues/pickers/project-picker";
import { StatePicker } from "@/components/issues/pickers/state-picker";
import { StateIcon } from "@/components/issues/state-icon";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { MenuItem } from "@/components/ui/menu-item";
import { Popover } from "@/components/ui/popover";
import { PropertyButton } from "@/components/ui/property-button";
import { useWorkspaceData } from "@/components/workspace/workspace-data-provider";
import {
  addIssueRelation,
  removeIssueRelation,
  setIssueAssignee,
  setIssueDueDate,
  setIssueEstimate,
  setIssueLabels,
  setIssueMilestone,
  setIssueParent,
  setIssuePriority,
  setIssueProject,
  setIssueState,
  toggleIssueSubscription,
} from "@/lib/issues/actions";
import type { IssueDetail } from "@/lib/issues/detail-queries";
import type { IssueListItem, IssueRelationSummary } from "@/lib/issues/types";
import { classNames } from "@/lib/utilities/class-names";
import { issuePathForReference } from "@/lib/issues/reference";
import { Timestamp } from "@/components/ui/timestamp";

/**
 * Named field by field rather than taken as `IssueDetail`: this is a client
 * component, so whatever it is handed is serialised into the page's payload
 * whether or not it renders.
 */
type IssuePropertiesPanelProps = {
  readonly issue: IssueListItem;
  readonly milestone: IssueDetail["milestone"];
  readonly projectMilestones: IssueDetail["projectMilestones"];
  readonly relations: IssueDetail["relations"];
  readonly subscribers: IssueDetail["subscribers"];
  readonly isSubscribed: boolean;
  readonly reminders: ReactNode;
  readonly className?: string;
};

const relationHeadings: Readonly<Record<IssueRelationSummary["type"], string>> = {
  blocks: "Blocking",
  blocked_by: "Blocked by",
  related: "Related",
  duplicate: "Duplicate of",
};

export const IssuePropertiesPanel = ({
  issue,
  milestone,
  projectMilestones,
  relations,
  subscribers,
  isSubscribed,
  reminders,
  className,
}: IssuePropertiesPanelProps) => {
  const { currentUser } = useWorkspaceData();
  const [, startTransition] = useTransition();

  const row = (label: string, control: ReactNode) => (
    <div className="flex min-h-7 min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
      <span className="shrink-0 text-xs text-foreground-tertiary sm:w-[88px]">{label}</span>
      <div className="min-w-0 flex-1">{control}</div>
    </div>
  );

  const groupedRelations = (["blocked_by", "blocks", "related", "duplicate"] as const)
    .map((type) => ({ type, relations: relations.filter((relation) => relation.type === type) }))
    .filter((group) => group.relations.length > 0);

  return (
    <aside className={classNames("flex w-full flex-col gap-4 text-[13px] lg:w-[280px]", className)}>
      <section className="grid grid-cols-2 gap-x-4 gap-y-2 sm:flex sm:flex-col sm:gap-1">
        <h2 className="col-span-2 mb-1 text-xs font-medium text-foreground-tertiary">Properties</h2>
        {row(
          "Status",
          <StatePicker
            value={issue.state}
            variant="row"
            onSelect={(stateIdentifier) => startTransition(() => setIssueState(issue.identifier, stateIdentifier))}
          />,
        )}
        {row(
          "Priority",
          <PriorityPicker
            value={issue.priority}
            variant="row"
            onSelect={(priority) => startTransition(() => setIssuePriority(issue.identifier, priority))}
          />,
        )}
        {row(
          "Assignee",
          <AssigneePicker
            value={issue.assignee}
            variant="row"
            onSelect={(assigneeIdentifier) => startTransition(() => setIssueAssignee(issue.identifier, assigneeIdentifier))}
          />,
        )}
        {row(
          "Labels",
          <LabelPicker
            value={issue.labels}
            variant="row"
            onChange={(labelIdentifiers) => startTransition(() => setIssueLabels(issue.identifier, labelIdentifiers))}
          />,
        )}
        {row(
          "Estimate",
          <EstimatePicker
            value={issue.estimate}
            variant="row"
            onSelect={(estimate) => startTransition(() => setIssueEstimate(issue.identifier, estimate))}
          />,
        )}
        {row(
          "Due date",
          <DueDatePicker
            value={issue.dueDate}
            variant="row"
            onSelect={(dueDate) => startTransition(() => setIssueDueDate(issue.identifier, dueDate))}
          />,
        )}
      </section>

      <section className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 sm:flex sm:flex-col sm:gap-1">
        {row(
          "Project",
          <ProjectPicker
            value={issue.project}
            variant="row"
            onSelect={(projectIdentifier) => startTransition(() => setIssueProject(issue.identifier, projectIdentifier))}
          />,
        )}
        {issue.project && projectMilestones.length > 0
          ? row(
              "Milestone",
              <MilestonePicker
                value={milestone}
                milestones={projectMilestones}
                onSelect={(milestoneIdentifier) =>
                  startTransition(() => setIssueMilestone(issue.identifier, milestoneIdentifier))
                }
              />,
            )
          : null}
        {row(
          "Parent",
          issue.parent ? (
            <div className="flex items-center gap-1">
              <Link
                href={issuePathForReference(issue.parent.reference)}
                className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-foreground-secondary hover:bg-background-tertiary"
              >
                <Icon name="parent" size={14} className="text-foreground-tertiary" />
                <span className="truncate">
                  <span className="font-mono text-xs text-foreground-tertiary">{issue.parent.reference}</span>{" "}
                  {issue.parent.title}
                </span>
              </Link>
              <IconButton
                size="inline"
                tone="subtle"
                onClick={() => startTransition(() => setIssueParent(issue.identifier, null))}
                aria-label="Remove parent"
              >
                <Icon name="close" size={12} />
              </IconButton>
            </div>
          ) : (
            <IssueSearchPicker
              trigger={
                <PropertyButton variant="row" muted icon={<Icon name="parent" size={14} />}>
                  Set parent
                </PropertyButton>
              }
              excludeIdentifiers={[issue.identifier]}
              placeholder="Search parent issue…"
              onSelect={(hit) => startTransition(() => setIssueParent(issue.identifier, hit.identifier))}
            />
          ),
        )}
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium text-foreground-tertiary">Relations</h2>
          <Popover
            align="end"
            trigger={
              <IconButton size="compact" tone="muted" aria-label="Add relation">
                <Icon name="plus" size={13} />
              </IconButton>
            }
          >
            {(closeTypeMenu) => (
              <div className="flex w-[240px] flex-col p-1">
                {(["blocks", "blocked_by", "related", "duplicate"] as const).map((type) => (
                  <IssueSearchPicker
                    key={type}
                    trigger={
                      <MenuItem as="button" className="w-full">
                        <Icon name={type === "duplicate" ? "duplicate" : type === "related" ? "link" : "block"} size={14} className="text-foreground-tertiary" />
                        {relationHeadings[type]}…
                      </MenuItem>
                    }
                    excludeIdentifiers={[issue.identifier]}
                    placeholder={`${relationHeadings[type]}…`}
                    onSelect={(hit) => {
                      startTransition(() => addIssueRelation(issue.identifier, hit.identifier, type));
                      closeTypeMenu();
                    }}
                  />
                ))}
              </div>
            )}
          </Popover>
        </div>
        {groupedRelations.length === 0 ? (
          <p className="text-xs text-foreground-quaternary">No relations yet.</p>
        ) : (
          groupedRelations.map((group) => (
            <div key={group.type} className="flex flex-col gap-0.5">
              <div className="text-2xs font-medium uppercase tracking-wide text-foreground-quaternary">
                {relationHeadings[group.type]}
              </div>
              {group.relations.map((relation) => (
                <div key={relation.identifier} className="group/relation flex items-center gap-1">
                  <Link
                    href={issuePathForReference(relation.issue.reference)}
                    className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-foreground-secondary hover:bg-background-tertiary"
                  >
                    <StateIcon type={relation.issue.state.type} color={relation.issue.state.color} />
                    <span className="truncate">
                      <span className="font-mono text-xs text-foreground-tertiary">{relation.issue.reference}</span>{" "}
                      {relation.issue.title}
                    </span>
                  </Link>
                  <IconButton
                    size="inline"
                    tone="subtle"
                    revealOnGroupHover="md:group-hover/relation:opacity-100"
                    onClick={() => startTransition(() => removeIssueRelation(relation.identifier))}
                    aria-label="Remove relation"
                  >
                    <Icon name="close" size={12} />
                  </IconButton>
                </div>
              ))}
            </div>
          ))
        )}
      </section>

      {reminders}

      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium text-foreground-tertiary">Subscribers</h2>
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                await toggleIssueSubscription(issue.identifier);
              })
            }
            className="text-xs text-foreground-tertiary hover:text-foreground"
          >
            {isSubscribed ? "Unsubscribe" : "Subscribe"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {subscribers.length === 0 ? (
            <span className="text-xs text-foreground-quaternary">Nobody yet</span>
          ) : (
            subscribers.map((subscriber) => (
              <Avatar
                key={subscriber.identifier}
                name={subscriber.identifier === currentUser.identifier ? `${subscriber.name} (you)` : subscriber.name}
                color={subscriber.avatarColor}
                image={subscriber.image}
                size={20}
              />
            ))
          )}
        </div>
      </section>

      <section className="flex flex-col gap-1 border-t border-border pt-3 text-xs text-foreground-quaternary">
        <div>
          <Timestamp value={issue.createdAt} format="relative" prefix="Created" />
          {issue.creator ? ` by ${issue.creator.name}` : ""}
        </div>
        <div>
          <Timestamp value={issue.updatedAt} format="relative" prefix="Updated" />
        </div>
        {issue.completedAt ? (
          <div>
            <Timestamp value={issue.completedAt} format="relative" prefix="Completed" />
          </div>
        ) : null}
      </section>
    </aside>
  );
};
