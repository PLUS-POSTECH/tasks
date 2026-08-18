import { ScrollArea } from "@/components/ui/scroll-area";
import { groupIssues } from "@/lib/issues/grouping";
import {
  issuePageSize,
  resolveIssueFilter,
  settledFilterCategories,
  type IssueFilter,
  type IssueGrouping,
  type IssueScope,
  type IssueViewOptions,
} from "@/lib/issues/filters";
import { listIssuePage } from "@/lib/issues/queries";
import type { IssueStateSummary } from "@/lib/workflow/types";
import { getCurrentUser } from "@/lib/session/current-user";
import { listStates } from "@/lib/workflow/queries";

import { ActiveFilterChips } from "./active-filter-chips";
import type { CreateIssueDefaults } from "./create-issue/create-issue-dialog-context";
import { DisplayOptionsMenu } from "./display-options-menu";
import { FilterMenu } from "./filter-menu";
import { IssueBoard } from "./issue-board";
import { IssueList } from "./issue-list";
import { LoadMoreIssues } from "./load-more-issues";

type IssuesViewProps = {
  /** What the route decided this page is about; the filter can only narrow it. */
  readonly scope: IssueScope;
  readonly filter: IssueFilter;
  readonly options: IssueViewOptions;
  readonly loadedIssueCount: number;
  readonly allowBoard?: boolean;
  readonly groupingChoices?: readonly IssueGrouping[];
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly createDefaults?: CreateIssueDefaults;
  readonly visibleStates?: readonly IssueStateSummary[];
};

/**
 * The grouping and the ordering the member chose are applied here, over
 * whatever has been loaded, and grouping by label puts one issue in several
 * groups at once — so while anything is unloaded *any* group may be short, not
 * only the last, and the "load more" control stays on screen until it is not.
 */
export const IssuesView = async ({
  scope,
  filter,
  options,
  loadedIssueCount,
  allowBoard = true,
  groupingChoices,
  emptyTitle,
  emptyDescription,
  createDefaults,
  visibleStates,
}: IssuesViewProps) => {
  const currentUser = await getCurrentUser();
  const page = await listIssuePage(
    scope,
    resolveIssueFilter(filter, currentUser.identifier),
    loadedIssueCount,
  );
  const states = visibleStates ?? (await listStates());

  const visibleIssues = options.showCompleted
    ? page.issues
    : page.issues.filter((issue) => issue.state.type !== "completed" && issue.state.type !== "canceled");

  const groups = groupIssues(visibleIssues, options.grouping, options.ordering, {
    states,
    showEmptyGroups: options.showEmptyGroups,
  });

  const loadMore = page.hasMore ? (
    <LoadMoreIssues nextIssueCount={loadedIssueCount + issuePageSize} />
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-3">
        <FilterMenu settled={settledFilterCategories(scope)} />
        <div className="flex-1" />
        <DisplayOptionsMenu options={options} allowBoard={allowBoard} groupingChoices={groupingChoices} />
      </div>
      <ActiveFilterChips />
      {options.layout === "board" && allowBoard ? (
        <>
          <IssueBoard groups={groups} createDefaults={createDefaults} />
          {loadMore}
        </>
      ) : (
        <ScrollArea>
          <IssueList
            groups={groups}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            createDefaults={createDefaults}
            loadMore={loadMore}
          />
        </ScrollArea>
      )}
    </div>
  );
};
