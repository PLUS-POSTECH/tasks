import { IssuesView } from "@/components/issues/issues-view";
import { NewIssueButton } from "@/components/issues/new-issue-button";
import { PageHeader } from "@/components/layout/page-header";
import { TabLink } from "@/components/layout/tab-link";
import { Icon } from "@/components/ui/icon";
import type { WorkflowStateType } from "@/lib/database/schema";
import {
  everyIssueScope,
  parseIssueFilter,
  parseIssueViewOptions,
  parseLoadedIssueCount,
  type IssueViewOptions,
  type SearchParameters,
} from "@/lib/issues/filters";
import { listStates } from "@/lib/workflow/queries";

export type IssuesTab = "active" | "backlog" | "all";

type IssuesTabPageProps = {
  readonly tab: IssuesTab;
  readonly searchParameters: SearchParameters;
};

type IssuesTabDefinition = {
  readonly title: string;
  /** The states the tab is about, which are also what it is scoped to. */
  readonly stateTypes: readonly WorkflowStateType[];
  readonly defaultViewOptions: IssueViewOptions;
  readonly createsInBacklog: boolean;
};

const tabDefinitions: Readonly<Record<IssuesTab, IssuesTabDefinition>> = {
  active: {
    title: "Active issues",
    stateTypes: ["unstarted", "started"],
    defaultViewOptions: {
      grouping: "state",
      ordering: "priority",
      layout: "list",
      showCompleted: true,
      showEmptyGroups: true,
    },
    createsInBacklog: false,
  },
  backlog: {
    title: "Backlog",
    stateTypes: ["backlog"],
    defaultViewOptions: {
      grouping: "none",
      ordering: "priority",
      layout: "list",
      showCompleted: true,
      showEmptyGroups: false,
    },
    createsInBacklog: true,
  },
  all: {
    title: "All issues",
    stateTypes: ["backlog", "unstarted", "started", "completed", "canceled"],
    defaultViewOptions: {
      grouping: "state",
      ordering: "priority",
      layout: "list",
      showCompleted: true,
      showEmptyGroups: false,
    },
    createsInBacklog: false,
  },
};

export const IssuesTabPage = async ({ tab, searchParameters }: IssuesTabPageProps) => {
  const definition = tabDefinitions[tab];
  const states = await listStates();
  const visibleStates = states.filter((state) => definition.stateTypes.includes(state.type));
  const backlogStateIdentifier = definition.createsInBacklog
    ? states.find((state) => state.type === "backlog")?.identifier
    : undefined;

  const options = parseIssueViewOptions(searchParameters, definition.defaultViewOptions);

  return (
    <>
      <PageHeader
        title={definition.title}
        icon={<Icon name="issues" size={15} />}
        tabs={
          <>
            <TabLink href="/issues/active">Active</TabLink>
            <TabLink href="/issues/backlog">Backlog</TabLink>
            <TabLink href="/issues" exact>
              All
            </TabLink>
          </>
        }
        actions={<NewIssueButton stateIdentifier={backlogStateIdentifier} />}
      />
      <IssuesView
        scope={{ ...everyIssueScope, stateTypes: [...definition.stateTypes] }}
        filter={parseIssueFilter(searchParameters)}
        options={options}
        loadedIssueCount={parseLoadedIssueCount(searchParameters)}
        visibleStates={visibleStates}
        emptyTitle={`No ${definition.title.toLowerCase()}`}
        emptyDescription="Create an issue or adjust the filters to see more."
        createDefaults={{ stateIdentifier: backlogStateIdentifier }}
      />
    </>
  );
};
