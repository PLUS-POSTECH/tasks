import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { generateAuthSecret } from "@/lib/auth/secret";

import {
  activityTypeEnum,
  issueRelationTypeEnum,
  notificationTypeEnum,
  projectHealthEnum,
  projectStatusEnum,
  workflowStateTypeEnum,
} from "./enums";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const workspaces = pgTable("workspaces", {
  identifier: uuid("identifier").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  issueCounter: integer("issue_counter").notNull().default(0),
  /** Discord server whose members may sign in; null blocks every sign-in. */
  discordGuildIdentifier: text("discord_guild_identifier"),
  /** Public URL the app is served from; used for OAuth redirects and cookies. */
  authBaseUrl: text("auth_base_url"),
  authSecret: text("auth_secret").notNull().$defaultFn(generateAuthSecret),
  discordClientIdentifier: text("discord_client_identifier"),
  discordClientSecret: text("discord_client_secret"),
  /** Bot token used to read server roles for project access; the bot must be in the server. */
  discordBotToken: text("discord_bot_token"),
  /** Server icon mirrored from Discord; null when the server has none. */
  iconUrl: text("icon_url"),
  /** IANA time zone that due dates and reminder times are interpreted in. */
  timezone: text("timezone").notNull().default("Asia/Seoul"),
  /** Discord roles this workspace treats as admins, on top of the two below. */
  adminRoleIdentifiers: jsonb("admin_role_identifiers")
    .$type<readonly string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  /** Server owner, mirrored by the member sync; always an admin here. */
  discordOwnerIdentifier: text("discord_owner_identifier"),
  /** Server roles carrying Discord's Administrator permission, mirrored by the sync. */
  discordAdministratorRoleIdentifiers: jsonb("discord_administrator_role_identifiers")
    .$type<readonly string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  /** When the member sync last mirrored the server; a failed pass leaves it alone. */
  discordSyncedAt: timestamp("discord_synced_at", { withTimezone: true }),
  /**
   * The failure that ended the last pass, or the reason it refused to act on
   * the roster it read; null when the last pass mirrored the server completely.
   */
  discordSyncError: text("discord_sync_error"),
  ...timestamps,
});

export const discordWebhooks = pgTable("discord_webhooks", {
  identifier: uuid("identifier").primaryKey().defaultRandom(),
  workspaceIdentifier: uuid("workspace_identifier")
    .notNull()
    .references(() => workspaces.identifier, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  ...timestamps,
});

/**
 * Managed by better-auth as its `user` model, which is why the primary key is
 * `id`: the auth library does not allow renaming that column.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceIdentifier: uuid("workspace_identifier")
      .notNull()
      .references(() => workspaces.identifier, { onDelete: "cascade" }),
    name: text("name").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    avatarColor: text("avatar_color").notNull(),
    isAdmin: boolean("is_admin").notNull().default(false),
    discordRoleIdentifiers: jsonb("discord_role_identifiers")
      .$type<readonly string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    discordRolesSyncedAt: timestamp("discord_roles_synced_at", { withTimezone: true }),
    /** When a role refresh last failed; it holds the bot off until one succeeds. */
    discordRolesFailedAt: timestamp("discord_roles_failed_at", { withTimezone: true }),
    discordUserIdentifier: text("discord_user_identifier"),
    /** When the member sync last found this person missing from the server. */
    leftGuildAt: timestamp("left_guild_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_workspace_email_unique").on(
      table.workspaceIdentifier,
      table.email,
    ),
    uniqueIndex("users_discord_user_unique").on(table.discordUserIdentifier),
  ],
);

/** better-auth session model. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [index("sessions_user_index").on(table.userId)],
);

/** better-auth account model: one row per linked OAuth provider. */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    ...timestamps,
  },
  (table) => [index("accounts_user_index").on(table.userId)],
);

export const apiTokens = pgTable(
  "api_tokens",
  {
    identifier: uuid("identifier").primaryKey().defaultRandom(),
    userIdentifier: uuid("user_identifier")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    /** First characters of the token, for recognising it in the UI. */
    tokenPrefix: text("token_prefix").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("api_tokens_user_index").on(table.userIdentifier)],
);

/** better-auth verification model (OAuth state, etc.). */
export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index("verifications_identifier_index").on(table.identifier)],
);

export const workflowStates = pgTable(
  "workflow_states",
  {
    identifier: uuid("identifier").primaryKey().defaultRandom(),
    workspaceIdentifier: uuid("workspace_identifier")
      .notNull()
      .references(() => workspaces.identifier, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: workflowStateTypeEnum("type").notNull(),
    color: text("color").notNull(),
    position: doublePrecision("position").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workflow_states_workspace_name_unique").on(
      table.workspaceIdentifier,
      table.name,
    ),
  ],
);

export const labels = pgTable(
  "labels",
  {
    identifier: uuid("identifier").primaryKey().defaultRandom(),
    workspaceIdentifier: uuid("workspace_identifier")
      .notNull()
      .references(() => workspaces.identifier, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    ...timestamps,
  },
);

export const projects = pgTable("projects", {
  identifier: uuid("identifier").primaryKey().defaultRandom(),
  workspaceIdentifier: uuid("workspace_identifier")
    .notNull()
    .references(() => workspaces.identifier, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content"),
  icon: text("icon").notNull().default("▣"),
  color: text("color").notNull().default("#5e6ad2"),
  status: projectStatusEnum("status").notNull().default("backlog"),
  health: projectHealthEnum("health"),
  leadIdentifier: uuid("lead_identifier").references(() => users.id, {
    onDelete: "set null",
  }),
  startDate: date("start_date"),
  targetDate: date("target_date"),
  sortOrder: doublePrecision("sort_order").notNull().default(0),
  ...timestamps,
});

export const projectMembers = pgTable(
  "project_members",
  {
    projectIdentifier: uuid("project_identifier")
      .notNull()
      .references(() => projects.identifier, { onDelete: "cascade" }),
    userIdentifier: uuid("user_identifier")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.projectIdentifier, table.userIdentifier] }),
  ],
);

/**
 * A project with no rows here is open to every member; with rows, only members
 * holding one of the roles — plus the lead, explicit members and admins — can
 * see or change it.
 */
export const projectRoleAccess = pgTable(
  "project_role_access",
  {
    projectIdentifier: uuid("project_identifier")
      .notNull()
      .references(() => projects.identifier, { onDelete: "cascade" }),
    discordRoleIdentifier: text("discord_role_identifier").notNull(),
    /** Role name at the time it was granted, shown when the bot is unavailable. */
    discordRoleName: text("discord_role_name").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectIdentifier, table.discordRoleIdentifier] }),
  ],
);

export const projectMilestones = pgTable("project_milestones", {
  identifier: uuid("identifier").primaryKey().defaultRandom(),
  projectIdentifier: uuid("project_identifier")
    .notNull()
    .references(() => projects.identifier, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetDate: date("target_date"),
  sortOrder: doublePrecision("sort_order").notNull().default(0),
  ...timestamps,
});

export const projectUpdates = pgTable("project_updates", {
  identifier: uuid("identifier").primaryKey().defaultRandom(),
  projectIdentifier: uuid("project_identifier")
    .notNull()
    .references(() => projects.identifier, { onDelete: "cascade" }),
  /** Null once the author is removed: the update they wrote is workspace history. */
  authorIdentifier: uuid("author_identifier").references(() => users.id, {
    onDelete: "set null",
  }),
  health: projectHealthEnum("health").notNull(),
  body: text("body").notNull(),
  ...timestamps,
});

export const issues = pgTable(
  "issues",
  {
    identifier: uuid("identifier").primaryKey().defaultRandom(),
    workspaceIdentifier: uuid("workspace_identifier")
      .notNull()
      .references(() => workspaces.identifier, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    priority: integer("priority").notNull().default(0),
    stateIdentifier: uuid("state_identifier")
      .notNull()
      .references(() => workflowStates.identifier, { onDelete: "restrict" }),
    assigneeIdentifier: uuid("assignee_identifier").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    creatorIdentifier: uuid("creator_identifier").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    projectIdentifier: uuid("project_identifier").references(
      () => projects.identifier,
      { onDelete: "set null" },
    ),
    milestoneIdentifier: uuid("milestone_identifier").references(
      () => projectMilestones.identifier,
      { onDelete: "set null" },
    ),
    // A deleted parent leaves its sub-issues in place as top-level issues.
    parentIdentifier: uuid("parent_identifier").references((): AnyPgColumn => issues.identifier, {
      onDelete: "set null",
    }),
    estimate: integer("estimate"),
    dueDate: date("due_date"),
    /** Manual order in lists; a drop writes the midpoint of its neighbours. */
    sortOrder: doublePrecision("sort_order").notNull().default(0),
    /** Manual order within a board column, written the same way. */
    boardOrder: doublePrecision("board_order").notNull().default(0),
    /** When the issue entered a completed state; cleared when it leaves one. */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("issues_workspace_number_unique").on(
      table.workspaceIdentifier,
      table.number,
    ),
    index("issues_state_index").on(table.stateIdentifier),
    index("issues_assignee_index").on(table.assigneeIdentifier),
    index("issues_project_index").on(table.projectIdentifier),
    index("issues_parent_index").on(table.parentIdentifier),
  ],
);

export const issueLabels = pgTable(
  "issue_labels",
  {
    issueIdentifier: uuid("issue_identifier")
      .notNull()
      .references(() => issues.identifier, { onDelete: "cascade" }),
    labelIdentifier: uuid("label_identifier")
      .notNull()
      .references(() => labels.identifier, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.issueIdentifier, table.labelIdentifier] }),
  ],
);

export const issueRelations = pgTable(
  "issue_relations",
  {
    identifier: uuid("identifier").primaryKey().defaultRandom(),
    issueIdentifier: uuid("issue_identifier")
      .notNull()
      .references(() => issues.identifier, { onDelete: "cascade" }),
    relatedIssueIdentifier: uuid("related_issue_identifier")
      .notNull()
      .references(() => issues.identifier, { onDelete: "cascade" }),
    type: issueRelationTypeEnum("type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("issue_relations_unique").on(
      table.issueIdentifier,
      table.relatedIssueIdentifier,
      table.type,
    ),
  ],
);

/**
 * A scheduled Discord message about an issue's due date. `nextRunAt` is
 * derived from the cadence below, the issue's due date and the workspace time
 * zone; null means nothing is pending.
 */
export const issueReminders = pgTable(
  "issue_reminders",
  {
    identifier: uuid("identifier").primaryKey().defaultRandom(),
    issueIdentifier: uuid("issue_identifier")
      .notNull()
      .references(() => issues.identifier, { onDelete: "cascade" }),
    webhookIdentifier: uuid("webhook_identifier")
      .notNull()
      .references(() => discordWebhooks.identifier, { onDelete: "cascade" }),
    /** Minutes before the deadline the first post goes out; null starts at once. */
    leadMinutes: integer("lead_minutes"),
    /** Minutes between posts until the deadline; null posts once. */
    repeatEveryMinutes: integer("repeat_every_minutes"),
    /** Deadline time on the due date, "HH:MM" in the workspace time zone. */
    timeOfDay: text("time_of_day").notNull(),
    /** Custom text; null posts the default message. */
    message: text("message"),
    createdByIdentifier: uuid("created_by_identifier").references(() => users.id, {
      onDelete: "set null",
    }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    lastError: text("last_error"),
    /** Deliveries Discord refused since the last one it accepted; bounds the retries. */
    failedAttempts: integer("failed_attempts").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("issue_reminders_issue_index").on(table.issueIdentifier),
    index("issue_reminders_next_run_index").on(table.nextRunAt),
  ],
);

export const issueSubscriptions = pgTable(
  "issue_subscriptions",
  {
    issueIdentifier: uuid("issue_identifier")
      .notNull()
      .references(() => issues.identifier, { onDelete: "cascade" }),
    userIdentifier: uuid("user_identifier")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.issueIdentifier, table.userIdentifier] }),
  ],
);

export const comments = pgTable(
  "comments",
  {
    identifier: uuid("identifier").primaryKey().defaultRandom(),
    issueIdentifier: uuid("issue_identifier")
      .notNull()
      .references(() => issues.identifier, { onDelete: "cascade" }),
    authorIdentifier: uuid("author_identifier").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    /**
     * Only reached when the whole issue goes: deleting a comment that has
     * replies marks it deleted rather than removing the row.
     */
    parentIdentifier: uuid("parent_identifier").references((): AnyPgColumn => comments.identifier, {
      onDelete: "cascade",
    }),
    body: text("body").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    /**
     * Set when a comment that had replies was deleted: the row stays so the
     * thread survives, and reads drop it or render a placeholder. A comment
     * nobody replied to is deleted outright and never reaches this column.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("comments_issue_index").on(table.issueIdentifier)],
);

export const issueActivities = pgTable(
  "issue_activities",
  {
    identifier: uuid("identifier").primaryKey().defaultRandom(),
    issueIdentifier: uuid("issue_identifier")
      .notNull()
      .references(() => issues.identifier, { onDelete: "cascade" }),
    actorIdentifier: uuid("actor_identifier").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    type: activityTypeEnum("type").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, string | number | null>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("issue_activities_issue_index").on(table.issueIdentifier)],
);

export const notifications = pgTable(
  "notifications",
  {
    identifier: uuid("identifier").primaryKey().defaultRandom(),
    userIdentifier: uuid("user_identifier")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorIdentifier: uuid("actor_identifier").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    issueIdentifier: uuid("issue_identifier").references(
      () => issues.identifier,
      { onDelete: "cascade" },
    ),
    commentIdentifier: uuid("comment_identifier").references(
      () => comments.identifier,
      { onDelete: "cascade" },
    ),
    type: notificationTypeEnum("type").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("notifications_user_index").on(table.userIdentifier)],
);
