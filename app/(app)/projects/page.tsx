import { PageHeader } from "@/components/layout/page-header";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { ProjectsList } from "@/components/projects/projects-list";
import { Icon } from "@/components/ui/icon";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listProjects } from "@/lib/projects/queries";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const projects = await listProjects();
  return (
    <>
      <PageHeader title="Projects" icon={<Icon name="projects" size={15} />} actions={<NewProjectButton />} />
      <ScrollArea>
        <ProjectsList projects={projects} />
      </ScrollArea>
    </>
  );
}
