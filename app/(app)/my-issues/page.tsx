import { IssuesView } from "@/components/issues/issues-view";
import { PageHeader } from "@/components/layout/page-header";
import { TabLink } from "@/components/layout/tab-link";
import { Icon } from "@/components/ui/icon";
import {
  everyIssueScope,
  parseIssueFilter,
  parseIssueViewOptions,
  parseLoadedIssueCount,
  type IssueScope,
} from "@/lib/issues/filters";
import { getCurrentUser } from "@/lib/session/current-user";
import { listSubscribedIssueIdentifiers } from "@/lib/issues/queries";

export const metadata = { title: "My issues" };

const tabs = ["assigned", "created", "subscribed"] as const;
type MyIssuesTab = (typeof tabs)[number];

const isTab = (value: string | undefined): value is MyIssuesTab =>
  tabs.some((tab) => tab === value);

const scopeOfTab = async (tab: MyIssuesTab, currentUserIdentifier: string): Promise<IssueScope> => {
  switch (tab) {
    case "assigned":
      return { ...everyIssueScope, assigneeIdentifiers: [currentUserIdentifier] };
    case "created":
      return { ...everyIssueScope, creatorIdentifiers: [currentUserIdentifier] };
    case "subscribed":
      return {
        ...everyIssueScope,
        issueIdentifiers: await listSubscribedIssueIdentifiers(currentUserIdentifier),
      };
  }
};

export default async function MyIssuesPage(props: PageProps<"/my-issues">) {
  const searchParameters = await props.searchParams;
  const rawTab = searchParameters.tab;
  const tab: MyIssuesTab = isTab(typeof rawTab === "string" ? rawTab : undefined) ? (rawTab as MyIssuesTab) : "assigned";
  const currentUser = await getCurrentUser();

  const options = parseIssueViewOptions(searchParameters, {
    grouping: "state",
    ordering: "priority",
    layout: "list",
    showCompleted: tab !== "assigned",
    showEmptyGroups: false,
  });

  return (
    <>
      <PageHeader
        title="My issues"
        icon={<Icon name="my-issues" size={15} />}
        tabs={
          <>
            <TabLink href="/my-issues" exact>Assigned</TabLink>
            <TabLink href="/my-issues?tab=created" exact>Created</TabLink>
            <TabLink href="/my-issues?tab=subscribed" exact>Subscribed</TabLink>
          </>
        }
      />
      <IssuesView
        key={tab}
        scope={await scopeOfTab(tab, currentUser.identifier)}
        filter={parseIssueFilter(searchParameters)}
        options={options}
        loadedIssueCount={parseLoadedIssueCount(searchParameters)}
        allowBoard={false}
        groupingChoices={["state", "priority", "project", "label", "none"]}
        emptyTitle={tab === "assigned" ? "No issues assigned to you" : tab === "created" ? "You haven't created any issues" : "You aren't subscribed to any issues"}
        emptyDescription="Issues will appear here as they are assigned, created, or followed."
        createDefaults={{ assigneeIdentifier: currentUser.identifier }}
      />
    </>
  );
}
