import { IssuesTabPage } from "@/components/issues/issues-tab-page";

export const metadata = { title: "Active issues" };

export default async function ActiveIssuesPage(props: PageProps<"/issues/active">) {
  const searchParameters = await props.searchParams;
  return <IssuesTabPage tab="active" searchParameters={searchParameters} />;
}
