import { relations } from "drizzle-orm";

import {
  apiTokens,
  comments,
  discordWebhooks,
  issueActivities,
  issueLabels,
  issueRelations,
  issueReminders,
  issueSubscriptions,
  issues,
  labels,
  notifications,
  projectMembers,
  projectMilestones,
  projectRoleAccess,
  projectUpdates,
  projects,
  users,
  workflowStates,
  workspaces,
} from "./tables";

export const apiTokensRelations = relations(apiTokens, ({ one }) => ({
  user: one(users, {
    fields: [apiTokens.userIdentifier],
    references: [users.id],
  }),
}));

export const issueRemindersRelations = relations(issueReminders, ({ one }) => ({
  issue: one(issues, {
    fields: [issueReminders.issueIdentifier],
    references: [issues.identifier],
  }),
  webhook: one(discordWebhooks, {
    fields: [issueReminders.webhookIdentifier],
    references: [discordWebhooks.identifier],
  }),
  createdBy: one(users, {
    fields: [issueReminders.createdByIdentifier],
    references: [users.id],
  }),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  users: many(users),
  projects: many(projects),
  labels: many(labels),
  workflowStates: many(workflowStates),
  issues: many(issues),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [users.workspaceIdentifier],
    references: [workspaces.identifier],
  }),
  assignedIssues: many(issues, { relationName: "assignee" }),
  createdIssues: many(issues, { relationName: "creator" }),
}));

export const workflowStatesRelations = relations(
  workflowStates,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [workflowStates.workspaceIdentifier],
      references: [workspaces.identifier],
    }),
    issues: many(issues),
  }),
);

export const labelsRelations = relations(labels, ({ many }) => ({
  issueLabels: many(issueLabels),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [projects.workspaceIdentifier],
    references: [workspaces.identifier],
  }),
  lead: one(users, {
    fields: [projects.leadIdentifier],
    references: [users.id],
  }),
  members: many(projectMembers),
  roleAccess: many(projectRoleAccess),
  milestones: many(projectMilestones),
  updates: many(projectUpdates),
  issues: many(issues),
}));

export const projectRoleAccessRelations = relations(projectRoleAccess, ({ one }) => ({
  project: one(projects, {
    fields: [projectRoleAccess.projectIdentifier],
    references: [projects.identifier],
  }),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectIdentifier],
    references: [projects.identifier],
  }),
  user: one(users, {
    fields: [projectMembers.userIdentifier],
    references: [users.id],
  }),
}));

export const projectMilestonesRelations = relations(
  projectMilestones,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [projectMilestones.projectIdentifier],
      references: [projects.identifier],
    }),
    issues: many(issues),
  }),
);

export const projectUpdatesRelations = relations(projectUpdates, ({ one }) => ({
  project: one(projects, {
    fields: [projectUpdates.projectIdentifier],
    references: [projects.identifier],
  }),
  author: one(users, {
    fields: [projectUpdates.authorIdentifier],
    references: [users.id],
  }),
}));

export const issuesRelations = relations(issues, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [issues.workspaceIdentifier],
    references: [workspaces.identifier],
  }),
  state: one(workflowStates, {
    fields: [issues.stateIdentifier],
    references: [workflowStates.identifier],
  }),
  assignee: one(users, {
    fields: [issues.assigneeIdentifier],
    references: [users.id],
    relationName: "assignee",
  }),
  creator: one(users, {
    fields: [issues.creatorIdentifier],
    references: [users.id],
    relationName: "creator",
  }),
  project: one(projects, {
    fields: [issues.projectIdentifier],
    references: [projects.identifier],
  }),
  milestone: one(projectMilestones, {
    fields: [issues.milestoneIdentifier],
    references: [projectMilestones.identifier],
  }),
  parent: one(issues, {
    fields: [issues.parentIdentifier],
    references: [issues.identifier],
    relationName: "issueParent",
  }),
  children: many(issues, { relationName: "issueParent" }),
  issueLabels: many(issueLabels),
  comments: many(comments),
  activities: many(issueActivities),
  subscriptions: many(issueSubscriptions),
  reminders: many(issueReminders),
  outgoingRelations: many(issueRelations, { relationName: "relationSource" }),
  incomingRelations: many(issueRelations, { relationName: "relationTarget" }),
}));

export const issueLabelsRelations = relations(issueLabels, ({ one }) => ({
  issue: one(issues, {
    fields: [issueLabels.issueIdentifier],
    references: [issues.identifier],
  }),
  label: one(labels, {
    fields: [issueLabels.labelIdentifier],
    references: [labels.identifier],
  }),
}));

export const issueRelationsRelations = relations(issueRelations, ({ one }) => ({
  issue: one(issues, {
    fields: [issueRelations.issueIdentifier],
    references: [issues.identifier],
    relationName: "relationSource",
  }),
  relatedIssue: one(issues, {
    fields: [issueRelations.relatedIssueIdentifier],
    references: [issues.identifier],
    relationName: "relationTarget",
  }),
}));

export const issueSubscriptionsRelations = relations(
  issueSubscriptions,
  ({ one }) => ({
    issue: one(issues, {
      fields: [issueSubscriptions.issueIdentifier],
      references: [issues.identifier],
    }),
    user: one(users, {
      fields: [issueSubscriptions.userIdentifier],
      references: [users.id],
    }),
  }),
);

export const commentsRelations = relations(comments, ({ one, many }) => ({
  issue: one(issues, {
    fields: [comments.issueIdentifier],
    references: [issues.identifier],
  }),
  author: one(users, {
    fields: [comments.authorIdentifier],
    references: [users.id],
  }),
  parent: one(comments, {
    fields: [comments.parentIdentifier],
    references: [comments.identifier],
    relationName: "commentParent",
  }),
  replies: many(comments, { relationName: "commentParent" }),
}));

export const issueActivitiesRelations = relations(
  issueActivities,
  ({ one }) => ({
    issue: one(issues, {
      fields: [issueActivities.issueIdentifier],
      references: [issues.identifier],
    }),
    actor: one(users, {
      fields: [issueActivities.actorIdentifier],
      references: [users.id],
    }),
  }),
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userIdentifier],
    references: [users.id],
  }),
  actor: one(users, {
    fields: [notifications.actorIdentifier],
    references: [users.id],
  }),
  issue: one(issues, {
    fields: [notifications.issueIdentifier],
    references: [issues.identifier],
  }),
  comment: one(comments, {
    fields: [notifications.commentIdentifier],
    references: [comments.identifier],
  }),
}));
