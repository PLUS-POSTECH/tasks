CREATE TYPE "public"."activity_type" AS ENUM('created', 'title_changed', 'description_changed', 'state_changed', 'priority_changed', 'assignee_changed', 'label_added', 'label_removed', 'project_changed', 'milestone_changed', 'estimate_changed', 'due_date_changed', 'parent_changed', 'relation_added', 'relation_removed', 'commented');--> statement-breakpoint
CREATE TYPE "public"."issue_relation_type" AS ENUM('blocks', 'blocked_by', 'related', 'duplicate');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('issue_assigned', 'issue_commented', 'issue_state_changed');--> statement-breakpoint
CREATE TYPE "public"."project_health" AS ENUM('on_track', 'at_risk', 'off_track');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('backlog', 'planned', 'started', 'paused', 'completed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."workflow_state_type" AS ENUM('backlog', 'unstarted', 'started', 'completed', 'canceled');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"identifier" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_identifier" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"identifier" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_identifier" uuid NOT NULL,
	"author_identifier" uuid,
	"parent_identifier" uuid,
	"body" text NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_webhooks" (
	"identifier" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_identifier" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_activities" (
	"identifier" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_identifier" uuid NOT NULL,
	"actor_identifier" uuid,
	"type" "activity_type" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_labels" (
	"issue_identifier" uuid NOT NULL,
	"label_identifier" uuid NOT NULL,
	CONSTRAINT "issue_labels_issue_identifier_label_identifier_pk" PRIMARY KEY("issue_identifier","label_identifier")
);
--> statement-breakpoint
CREATE TABLE "issue_relations" (
	"identifier" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_identifier" uuid NOT NULL,
	"related_issue_identifier" uuid NOT NULL,
	"type" "issue_relation_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_reminders" (
	"identifier" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_identifier" uuid NOT NULL,
	"webhook_identifier" uuid NOT NULL,
	"lead_minutes" integer,
	"repeat_every_minutes" integer,
	"time_of_day" text NOT NULL,
	"message" text,
	"created_by_identifier" uuid,
	"next_run_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"last_error" text,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_subscriptions" (
	"issue_identifier" uuid NOT NULL,
	"user_identifier" uuid NOT NULL,
	CONSTRAINT "issue_subscriptions_issue_identifier_user_identifier_pk" PRIMARY KEY("issue_identifier","user_identifier")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"identifier" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_identifier" uuid NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"state_identifier" uuid NOT NULL,
	"assignee_identifier" uuid,
	"creator_identifier" uuid,
	"project_identifier" uuid,
	"milestone_identifier" uuid,
	"parent_identifier" uuid,
	"estimate" integer,
	"due_date" date,
	"sort_order" double precision DEFAULT 0 NOT NULL,
	"board_order" double precision DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"identifier" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_identifier" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"identifier" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_identifier" uuid NOT NULL,
	"actor_identifier" uuid,
	"issue_identifier" uuid,
	"comment_identifier" uuid,
	"type" "notification_type" NOT NULL,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_identifier" uuid NOT NULL,
	"user_identifier" uuid NOT NULL,
	CONSTRAINT "project_members_project_identifier_user_identifier_pk" PRIMARY KEY("project_identifier","user_identifier")
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"identifier" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_identifier" uuid NOT NULL,
	"name" text NOT NULL,
	"target_date" date,
	"sort_order" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_role_access" (
	"project_identifier" uuid NOT NULL,
	"discord_role_identifier" text NOT NULL,
	"discord_role_name" text NOT NULL,
	CONSTRAINT "project_role_access_project_identifier_discord_role_identifier_pk" PRIMARY KEY("project_identifier","discord_role_identifier")
);
--> statement-breakpoint
CREATE TABLE "project_updates" (
	"identifier" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_identifier" uuid NOT NULL,
	"author_identifier" uuid,
	"health" "project_health" NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"identifier" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_identifier" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"content" text,
	"icon" text DEFAULT '▣' NOT NULL,
	"color" text DEFAULT '#5e6ad2' NOT NULL,
	"status" "project_status" DEFAULT 'backlog' NOT NULL,
	"health" "project_health",
	"lead_identifier" uuid,
	"start_date" date,
	"target_date" date,
	"sort_order" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_identifier" uuid NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"avatar_color" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"discord_role_identifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"discord_roles_synced_at" timestamp with time zone,
	"discord_roles_failed_at" timestamp with time zone,
	"discord_user_identifier" text,
	"left_guild_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_states" (
	"identifier" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_identifier" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "workflow_state_type" NOT NULL,
	"color" text NOT NULL,
	"position" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"identifier" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"issue_counter" integer DEFAULT 0 NOT NULL,
	"discord_guild_identifier" text,
	"auth_base_url" text,
	"auth_secret" text NOT NULL,
	"discord_client_identifier" text,
	"discord_client_secret" text,
	"discord_bot_token" text,
	"icon_url" text,
	"timezone" text DEFAULT 'Asia/Seoul' NOT NULL,
	"admin_role_identifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"discord_owner_identifier" text,
	"discord_administrator_role_identifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"discord_synced_at" timestamp with time zone,
	"discord_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_identifier_users_id_fk" FOREIGN KEY ("user_identifier") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_issue_identifier_issues_identifier_fk" FOREIGN KEY ("issue_identifier") REFERENCES "public"."issues"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_identifier_users_id_fk" FOREIGN KEY ("author_identifier") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_identifier_comments_identifier_fk" FOREIGN KEY ("parent_identifier") REFERENCES "public"."comments"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_webhooks" ADD CONSTRAINT "discord_webhooks_workspace_identifier_workspaces_identifier_fk" FOREIGN KEY ("workspace_identifier") REFERENCES "public"."workspaces"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_activities" ADD CONSTRAINT "issue_activities_issue_identifier_issues_identifier_fk" FOREIGN KEY ("issue_identifier") REFERENCES "public"."issues"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_activities" ADD CONSTRAINT "issue_activities_actor_identifier_users_id_fk" FOREIGN KEY ("actor_identifier") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_issue_identifier_issues_identifier_fk" FOREIGN KEY ("issue_identifier") REFERENCES "public"."issues"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_label_identifier_labels_identifier_fk" FOREIGN KEY ("label_identifier") REFERENCES "public"."labels"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_issue_identifier_issues_identifier_fk" FOREIGN KEY ("issue_identifier") REFERENCES "public"."issues"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_related_issue_identifier_issues_identifier_fk" FOREIGN KEY ("related_issue_identifier") REFERENCES "public"."issues"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_reminders" ADD CONSTRAINT "issue_reminders_issue_identifier_issues_identifier_fk" FOREIGN KEY ("issue_identifier") REFERENCES "public"."issues"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_reminders" ADD CONSTRAINT "issue_reminders_webhook_identifier_discord_webhooks_identifier_fk" FOREIGN KEY ("webhook_identifier") REFERENCES "public"."discord_webhooks"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_reminders" ADD CONSTRAINT "issue_reminders_created_by_identifier_users_id_fk" FOREIGN KEY ("created_by_identifier") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_subscriptions" ADD CONSTRAINT "issue_subscriptions_issue_identifier_issues_identifier_fk" FOREIGN KEY ("issue_identifier") REFERENCES "public"."issues"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_subscriptions" ADD CONSTRAINT "issue_subscriptions_user_identifier_users_id_fk" FOREIGN KEY ("user_identifier") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_workspace_identifier_workspaces_identifier_fk" FOREIGN KEY ("workspace_identifier") REFERENCES "public"."workspaces"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_state_identifier_workflow_states_identifier_fk" FOREIGN KEY ("state_identifier") REFERENCES "public"."workflow_states"("identifier") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignee_identifier_users_id_fk" FOREIGN KEY ("assignee_identifier") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_creator_identifier_users_id_fk" FOREIGN KEY ("creator_identifier") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_identifier_projects_identifier_fk" FOREIGN KEY ("project_identifier") REFERENCES "public"."projects"("identifier") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_milestone_identifier_project_milestones_identifier_fk" FOREIGN KEY ("milestone_identifier") REFERENCES "public"."project_milestones"("identifier") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_parent_identifier_issues_identifier_fk" FOREIGN KEY ("parent_identifier") REFERENCES "public"."issues"("identifier") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_workspace_identifier_workspaces_identifier_fk" FOREIGN KEY ("workspace_identifier") REFERENCES "public"."workspaces"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_identifier_users_id_fk" FOREIGN KEY ("user_identifier") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_identifier_users_id_fk" FOREIGN KEY ("actor_identifier") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_issue_identifier_issues_identifier_fk" FOREIGN KEY ("issue_identifier") REFERENCES "public"."issues"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_identifier_comments_identifier_fk" FOREIGN KEY ("comment_identifier") REFERENCES "public"."comments"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_identifier_projects_identifier_fk" FOREIGN KEY ("project_identifier") REFERENCES "public"."projects"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_identifier_users_id_fk" FOREIGN KEY ("user_identifier") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_identifier_projects_identifier_fk" FOREIGN KEY ("project_identifier") REFERENCES "public"."projects"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_role_access" ADD CONSTRAINT "project_role_access_project_identifier_projects_identifier_fk" FOREIGN KEY ("project_identifier") REFERENCES "public"."projects"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_project_identifier_projects_identifier_fk" FOREIGN KEY ("project_identifier") REFERENCES "public"."projects"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_author_identifier_users_id_fk" FOREIGN KEY ("author_identifier") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_identifier_workspaces_identifier_fk" FOREIGN KEY ("workspace_identifier") REFERENCES "public"."workspaces"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_identifier_users_id_fk" FOREIGN KEY ("lead_identifier") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_workspace_identifier_workspaces_identifier_fk" FOREIGN KEY ("workspace_identifier") REFERENCES "public"."workspaces"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_states" ADD CONSTRAINT "workflow_states_workspace_identifier_workspaces_identifier_fk" FOREIGN KEY ("workspace_identifier") REFERENCES "public"."workspaces"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_index" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_tokens_user_index" ON "api_tokens" USING btree ("user_identifier");--> statement-breakpoint
CREATE INDEX "comments_issue_index" ON "comments" USING btree ("issue_identifier");--> statement-breakpoint
CREATE INDEX "issue_activities_issue_index" ON "issue_activities" USING btree ("issue_identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_relations_unique" ON "issue_relations" USING btree ("issue_identifier","related_issue_identifier","type");--> statement-breakpoint
CREATE INDEX "issue_reminders_issue_index" ON "issue_reminders" USING btree ("issue_identifier");--> statement-breakpoint
CREATE INDEX "issue_reminders_next_run_index" ON "issue_reminders" USING btree ("next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "issues_workspace_number_unique" ON "issues" USING btree ("workspace_identifier","number");--> statement-breakpoint
CREATE INDEX "issues_state_index" ON "issues" USING btree ("state_identifier");--> statement-breakpoint
CREATE INDEX "issues_assignee_index" ON "issues" USING btree ("assignee_identifier");--> statement-breakpoint
CREATE INDEX "issues_project_index" ON "issues" USING btree ("project_identifier");--> statement-breakpoint
CREATE INDEX "issues_parent_index" ON "issues" USING btree ("parent_identifier");--> statement-breakpoint
CREATE INDEX "notifications_user_index" ON "notifications" USING btree ("user_identifier");--> statement-breakpoint
CREATE INDEX "sessions_user_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_workspace_email_unique" ON "users" USING btree ("workspace_identifier","email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_discord_user_unique" ON "users" USING btree ("discord_user_identifier");--> statement-breakpoint
CREATE INDEX "verifications_identifier_index" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_states_workspace_name_unique" ON "workflow_states" USING btree ("workspace_identifier","name");