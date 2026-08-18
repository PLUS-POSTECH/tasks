import { IssuesTabPage } from "@/components/issues/issues-tab-page";

export const metadata = { title: "Backlog" };

export default async function BacklogPage(props: PageProps<"/issues/backlog">) {
  const searchParameters = await props.searchParams;
  return <IssuesTabPage tab="backlog" searchParameters={searchParameters} />;
}
