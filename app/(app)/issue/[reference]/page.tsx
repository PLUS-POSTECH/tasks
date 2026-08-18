import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityFeed } from "@/components/issues/detail/activity-feed";
import { CommentComposer } from "@/components/issues/detail/comment-composer";
import { IssueDescriptionEditor } from "@/components/issues/detail/issue-description-editor";
import { IssueHeaderActions } from "@/components/issues/detail/issue-header-actions";
import { IssuePropertiesPanel } from "@/components/issues/detail/issue-properties-panel";
import { IssueTitleEditor } from "@/components/issues/detail/issue-title-editor";
import { RemindersSection } from "@/components/issues/detail/reminders-section";
import { SubIssuesSection } from "@/components/issues/detail/sub-issues-section";
import { PageHeader } from "@/components/layout/page-header";
import { Markdown } from "@/components/markdown/markdown";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getIssueDetail } from "@/lib/issues/detail-queries";
import { listDiscordWebhooks } from "@/lib/reminders/queries";
import { getCurrentUser } from "@/lib/session/current-user";
import { issuePathForReference } from "@/lib/issues/reference";

export const generateMetadata = async (
  props: PageProps<"/issue/[reference]">,
): Promise<Metadata> => {
  const { reference } = await props.params;
  const currentUser = await getCurrentUser();
  const detail = await getIssueDetail(reference, currentUser.identifier);
  return { title: detail ? `${detail.issue.reference} ${detail.issue.title}` : "Issue not found" };
};

export default async function IssuePage(props: PageProps<"/issue/[reference]">) {
  const { reference } = await props.params;
  const currentUser = await getCurrentUser();
  const [detail, webhooks] = await Promise.all([getIssueDetail(reference, currentUser.identifier), listDiscordWebhooks()]);
  if (!detail) {
    notFound();
  }
  const { issue } = detail;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          <Link key="issues" href="/issues/active" className="hover:text-foreground">
            Issues
          </Link>,
          ...(issue.parent
            ? [
                <Link key="parent" href={issuePathForReference(issue.parent.reference)} className="hover:text-foreground">
                  {issue.parent.reference}
                </Link>,
              ]
            : []),
        ]}
        title={<span className="font-mono text-[13px]">{issue.reference}</span>}
        actions={
          <IssueHeaderActions
            issueIdentifier={issue.identifier}
            reference={issue.reference}
            title={issue.title}
            projectIdentifier={issue.project?.identifier ?? null}
            isSubscribed={detail.isSubscribed}
            // The same predicate `deleteIssue` applies, so the menu offers
            // nothing the server would refuse.
            canDelete={issue.creator?.identifier === currentUser.identifier || currentUser.isAdmin}
            commentCount={issue.commentCount}
            reminderCount={detail.reminders.length}
            subIssueCount={issue.subIssueCount}
          />
        }
      />
      <ScrollArea>
        <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 py-5 md:px-6 md:py-6 lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-x-10 lg:gap-y-6">
          <div className="flex min-w-0 flex-col gap-3 lg:col-start-1 lg:row-start-1">
            <IssueTitleEditor issueIdentifier={issue.identifier} title={issue.title} />
          </div>
          <IssuePropertiesPanel
            issue={issue}
            milestone={detail.milestone}
            projectMilestones={detail.projectMilestones}
            relations={detail.relations}
            subscribers={detail.subscribers}
            isSubscribed={detail.isSubscribed}
            reminders={
              <RemindersSection
                issueIdentifier={issue.identifier}
                hasDueDate={issue.dueDate !== null}
                reminders={detail.reminders}
                webhooks={webhooks}
              />
            }
            className="lg:col-start-2 lg:row-span-2 lg:row-start-1"
          />
          <article className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-2">
            <IssueDescriptionEditor
              issueIdentifier={issue.identifier}
              description={detail.description}
              renderedDescription={detail.description ? <Markdown source={detail.description} /> : null}
            />
            <SubIssuesSection
              parentIdentifier={issue.identifier}
              parentReference={issue.reference}
              projectIdentifier={issue.project?.identifier ?? null}
              subIssues={detail.subIssues}
            />
            <section className="flex flex-col gap-4 border-t border-border pt-5">
              <h2 className="text-[13px] font-medium text-foreground">Activity</h2>
              <ActivityFeed
                issueIdentifier={issue.identifier}
                activities={detail.activities}
                comments={detail.comments}
                relations={detail.relations}
              />
              <CommentComposer issueIdentifier={issue.identifier} />
            </section>
          </article>
        </div>
      </ScrollArea>
    </>
  );
}
