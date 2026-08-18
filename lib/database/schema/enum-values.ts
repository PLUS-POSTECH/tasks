/**
 * Plain enum values and their types. Kept free of database imports so client
 * components can use them; `enums.ts` turns them into Postgres enums.
 */
export const workflowStateTypes = [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
] as const;

export type WorkflowStateType = (typeof workflowStateTypes)[number];

export const projectStatuses = [
  "backlog",
  "planned",
  "started",
  "paused",
  "completed",
  "canceled",
] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export const projectHealths = ["on_track", "at_risk", "off_track"] as const;

export type ProjectHealth = (typeof projectHealths)[number];

export const issueRelationTypes = [
  "blocks",
  "blocked_by",
  "related",
  "duplicate",
] as const;

export type IssueRelationType = (typeof issueRelationTypes)[number];

export const activityTypes = [
  "created",
  "title_changed",
  "description_changed",
  "state_changed",
  "priority_changed",
  "assignee_changed",
  "assignee_added",
  "assignee_removed",
  "reporter_changed",
  "label_added",
  "label_removed",
  "project_changed",
  "milestone_changed",
  "estimate_changed",
  "due_date_changed",
  "parent_changed",
  "relation_added",
  "relation_removed",
  "commented",
] as const;

export type ActivityType = (typeof activityTypes)[number];

export const notificationTypes = [
  "issue_assigned",
  "issue_commented",
  "issue_state_changed",
] as const;

export type NotificationType = (typeof notificationTypes)[number];

export const priorities = [0, 1, 2, 3, 4] as const;

export type Priority = (typeof priorities)[number];
