import { Markdown } from "@/components/markdown/markdown";
import type { ProjectDetail } from "@/lib/projects/queries";

import { MilestonesSection } from "./milestones-section";
import { ProjectSummaryEditor } from "./project-summary-editor";
import { ProjectUpdates } from "./project-updates";

type ProjectOverviewProps = {
  readonly project: ProjectDetail;
};

export const ProjectOverview = ({ project }: ProjectOverviewProps) => (
  <div className="flex min-w-0 flex-1 flex-col gap-8">
    <ProjectSummaryEditor
      projectIdentifier={project.identifier}
      summary={project.description}
      content={project.content}
      renderedContent={project.content ? <Markdown source={project.content} /> : null}
    />
    <MilestonesSection
      projectIdentifier={project.identifier}
      color={project.color}
      milestones={project.milestones}
    />
    <ProjectUpdates
      projectIdentifier={project.identifier}
      health={project.health}
      updates={project.updates}
    />
  </div>
);
