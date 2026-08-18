import { IssuesTabPage } from "@/components/issues/issues-tab-page";

export const metadata = { title: "All issues" };

export default async function AllIssuesPage(props: PageProps<"/issues">) {
  const searchParameters = await props.searchParams;
  return <IssuesTabPage tab="all" searchParameters={searchParameters} />;
}
