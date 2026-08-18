import { IssuesView } from "@/components/issues/issues-view";
import { PageHeader } from "@/components/layout/page-header";
import { SearchForm } from "@/components/search/search-form";
import { Icon } from "@/components/ui/icon";
import {
  everyIssueScope,
  parseIssueFilter,
  parseIssueViewOptions,
  parseLoadedIssueCount,
} from "@/lib/issues/filters";

export const metadata = { title: "Search" };

export default async function SearchPage(props: PageProps<"/search">) {
  const searchParameters = await props.searchParams;
  const query = typeof searchParameters.q === "string" ? searchParameters.q : "";
  return (
    <>
      <PageHeader title="Search" icon={<Icon name="search" size={15} />} />
      <SearchForm initialQuery={query} />
      {query.trim().length > 0 ? (
        <IssuesView
          scope={everyIssueScope}
          filter={parseIssueFilter(searchParameters)}
          options={parseIssueViewOptions(searchParameters, {
            grouping: "none",
            ordering: "updated",
            layout: "list",
            showCompleted: true,
            showEmptyGroups: false,
          })}
          loadedIssueCount={parseLoadedIssueCount(searchParameters)}
          allowBoard={false}
          emptyTitle="No matching issues"
          emptyDescription="Try a different search term or an issue reference like #12."
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <div className="text-sm font-medium text-foreground">Search issues</div>
          <div className="text-xs text-foreground-tertiary">Type a title, keyword, or a reference like #12.</div>
        </div>
      )}
    </>
  );
}
