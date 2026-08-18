import { StatusGlyph, type StatusGlyphShape } from "@/components/ui/status-glyph";
import type { ProjectStatus } from "@/lib/database/schema/enum-values";
import { projectStatusDefinition } from "@/lib/projects/display";

type ProjectStatusIconProps = {
  readonly status: ProjectStatus;
  readonly size?: number;
  readonly className?: string;
};

const shapes: Readonly<Record<ProjectStatus, StatusGlyphShape>> = {
  backlog: "dashed",
  planned: "outline",
  started: "progress",
  paused: "paused",
  completed: "done",
  canceled: "canceled",
};

export const ProjectStatusIcon = ({ status, size = 14, className }: ProjectStatusIconProps) => (
  <StatusGlyph
    shape={shapes[status]}
    color={projectStatusDefinition(status).color}
    // A started project shows the same three-quarter arc whatever its progress.
    progress={0.75}
    size={size}
    className={className}
  />
);
