import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { ProgressCircle } from "@/components/ui/progress-circle";
import { formatShortDate } from "@/lib/formatting/dates";
import { calendarDateAtLocalMidnight } from "@/lib/formatting/calendar-date";
import type { ProjectListItem } from "@/lib/projects/queries";

import { ProjectHealthBadge } from "./project-health-badge";
import { ProjectLeadControl, ProjectStatusControl } from "./project-row-controls";
import { ProjectRowShell } from "./project-row-shell";

type ProjectRowProps = {
  readonly project: ProjectListItem;
};

export const ProjectRow = ({ project }: ProjectRowProps) => {
  const href = `/project/${project.identifier}`;
  const progress = project.progress.total === 0 ? 0 : project.progress.completed / project.progress.total;

  return (
    <ProjectRowShell href={href}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[15px]" style={{ color: project.color, backgroundColor: `${project.color}1a` }}>
        {project.icon}
      </span>
      <Link href={href} className="min-w-0 flex-1 truncate font-medium text-foreground hover:underline">
        {project.name}
      </Link>
      {project.restricted ? (
        <Icon name="lock" size={12} className="shrink-0 text-foreground-tertiary" aria-label="Restricted to Discord roles" />
      ) : null}
      <div className="hidden w-[130px] shrink-0 md:block">
        <ProjectHealthBadge health={project.health} />
      </div>
      <div className="w-auto shrink-0 sm:w-[130px]">
        <ProjectStatusControl projectIdentifier={project.identifier} status={project.status} />
      </div>
      <span className="hidden w-[90px] shrink-0 items-center gap-1.5 text-xs text-foreground-tertiary sm:flex" title="Progress">
        <ProgressCircle progress={progress} size={14} />
        {project.progress.completed}/{project.progress.total}
      </span>
      <span className="hidden w-[80px] shrink-0 items-center gap-1 text-xs text-foreground-tertiary md:flex" title="Target date">
        {project.targetDate ? (
          <>
            <Icon name="calendar" size={12} />
            {formatShortDate(calendarDateAtLocalMidnight(project.targetDate))}
          </>
        ) : null}
      </span>
      <ProjectLeadControl projectIdentifier={project.identifier} lead={project.lead} canManage={project.canManageAccess} />
    </ProjectRowShell>
  );
};
