import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { projectStatusDefinitions } from "@/lib/projects/display";
import type { ProjectListItem } from "@/lib/projects/queries";

import { ProjectRow } from "./project-row";
import { ProjectStatusIcon } from "./project-status-icon";

type ProjectsListProps = {
  readonly projects: readonly ProjectListItem[];
};

export const ProjectsList = ({ projects }: ProjectsListProps) => {
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="projects" size={18} />}
        title="No projects"
        description="Create a project to group issues around an outcome."
      />
    );
  }
  return (
    <div role="grid" className="flex flex-col pb-16">
      {projectStatusDefinitions.map((definition) => {
        const group = projects.filter((project) => project.status === definition.status);
        if (group.length === 0) {
          return null;
        }
        return (
          <section key={definition.status}>
            <div className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-border-subtle bg-background-secondary/95 px-4 text-[13px] font-medium text-foreground backdrop-blur">
              <ProjectStatusIcon status={definition.status} />
              {definition.name}
              <span className="text-xs font-normal text-foreground-tertiary">{group.length}</span>
            </div>
            {group.map((project) => (
              <ProjectRow key={project.identifier} project={project} />
            ))}
          </section>
        );
      })}
    </div>
  );
};
