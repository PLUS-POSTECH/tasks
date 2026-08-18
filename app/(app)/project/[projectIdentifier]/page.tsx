import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { IssuesView } from "@/components/issues/issues-view";
import { PageHeader } from "@/components/layout/page-header";
import { TabLink } from "@/components/layout/tab-link";
import { ProjectAccessPicker } from "@/components/projects/project-access-picker";
import { ProjectHeaderActions } from "@/components/projects/project-header-actions";
import { ProjectOverview } from "@/components/projects/project-overview";
import { ProjectPropertiesPanel } from "@/components/projects/project-properties-panel";
import { NewIssueButton } from "@/components/issues/new-issue-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  everyIssueScope,
  parseIssueFilter,
  parseIssueViewOptions,
  parseLoadedIssueCount,
} from "@/lib/issues/filters";
import { listDiscordRoles } from "@/lib/discord/roles";
import { getProjectDetail } from "@/lib/projects/queries";

/** A value that is not a uuid reaching the uuid column is a database error rather than an empty result. */
const projectIdentifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const findProject = async (projectIdentifier: string) =>
  projectIdentifierPattern.test(projectIdentifier) ? await getProjectDetail(projectIdentifier) : null;

export const generateMetadata = async (props: PageProps<"/project/[projectIdentifier]">): Promise<Metadata> => {
  const { projectIdentifier } = await props.params;
  const project = await findProject(projectIdentifier);
  return { title: project?.name ?? "Project" };
};

export default async function ProjectPage(props: PageProps<"/project/[projectIdentifier]">) {
  const { projectIdentifier } = await props.params;
  const searchParameters = await props.searchParams;
  const project = await findProject(projectIdentifier);
  if (!project) {
    notFound();
  }
  const tab = searchParameters.tab === "issues" ? "issues" : "overview";
  const discordRoles = tab === "overview" && project.canManageAccess ? await listDiscordRoles() : null;

  return (
    <>
      <PageHeader
        breadcrumbs={[<span key="projects">Projects</span>]}
        icon={<span style={{ color: project.color }}>{project.icon}</span>}
        title={project.name}
        tabs={
          <>
            <TabLink href={`/project/${project.identifier}`} exact>Overview</TabLink>
            <TabLink href={`/project/${project.identifier}?tab=issues`} exact>Issues</TabLink>
          </>
        }
        actions={
          <>
            <NewIssueButton projectIdentifier={project.identifier} />
            <ProjectHeaderActions
              projectIdentifier={project.identifier}
              projectName={project.name}
              canDelete={project.canManageAccess}
            />
          </>
        }
      />
      {tab === "issues" ? (
        <IssuesView
          scope={{ ...everyIssueScope, projectIdentifiers: [project.identifier] }}
          filter={parseIssueFilter(searchParameters)}
          options={parseIssueViewOptions(searchParameters)}
          loadedIssueCount={parseLoadedIssueCount(searchParameters)}
          groupingChoices={["state", "assignee", "priority", "label", "none"]}
          allowBoard={false}
          emptyTitle="No issues in this project"
          emptyDescription="Add issues to the project to track its progress."
          createDefaults={{ projectIdentifier: project.identifier }}
        />
      ) : (
        <ScrollArea>
          <div className="mx-auto flex max-w-[1180px] flex-col gap-8 px-4 py-5 md:px-6 md:py-6 lg:flex-row lg:gap-10">
            <ProjectOverview project={project} />
            <ProjectPropertiesPanel
              project={project}
              access={
                <ProjectAccessPicker
                  projectIdentifier={project.identifier}
                  accessRoles={project.accessRoles}
                  discordRoles={discordRoles}
                  issueCount={project.progress.total}
                  canManage={project.canManageAccess}
                />
              }
            />
          </div>
        </ScrollArea>
      )}
    </>
  );
}
