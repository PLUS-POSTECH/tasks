ALTER TYPE "public"."activity_type" ADD VALUE 'assignee_added' BEFORE 'reporter_changed';--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'assignee_removed' BEFORE 'reporter_changed';--> statement-breakpoint
CREATE TABLE "issue_assignees" (
	"issue_identifier" uuid NOT NULL,
	"user_identifier" uuid NOT NULL,
	CONSTRAINT "issue_assignees_issue_identifier_user_identifier_pk" PRIMARY KEY("issue_identifier","user_identifier")
);
--> statement-breakpoint
INSERT INTO "issue_assignees" ("issue_identifier", "user_identifier")
SELECT "identifier", "assignee_identifier"
FROM "issues"
WHERE "assignee_identifier" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "issues" DROP CONSTRAINT "issues_assignee_identifier_users_id_fk";
--> statement-breakpoint
DROP INDEX "issues_assignee_index";--> statement-breakpoint
ALTER TABLE "issue_assignees" ADD CONSTRAINT "issue_assignees_issue_identifier_issues_identifier_fk" FOREIGN KEY ("issue_identifier") REFERENCES "public"."issues"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_assignees" ADD CONSTRAINT "issue_assignees_user_identifier_users_id_fk" FOREIGN KEY ("user_identifier") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_assignees_user_index" ON "issue_assignees" USING btree ("user_identifier");--> statement-breakpoint
ALTER TABLE "issues" DROP COLUMN "assignee_identifier";
