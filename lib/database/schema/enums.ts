import { pgEnum } from "drizzle-orm/pg-core";

import {
  activityTypes,
  issueRelationTypes,
  notificationTypes,
  projectHealths,
  projectStatuses,
  workflowStateTypes,
} from "./enum-values";

export * from "./enum-values";

export const workflowStateTypeEnum = pgEnum("workflow_state_type", workflowStateTypes);
export const projectStatusEnum = pgEnum("project_status", projectStatuses);
export const projectHealthEnum = pgEnum("project_health", projectHealths);
export const issueRelationTypeEnum = pgEnum("issue_relation_type", issueRelationTypes);
export const activityTypeEnum = pgEnum("activity_type", activityTypes);
export const notificationTypeEnum = pgEnum("notification_type", notificationTypes);
