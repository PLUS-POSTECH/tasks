import type { ProjectHealth } from "@/lib/database/schema";
import { projectHealthDefinition } from "@/lib/projects/display";
import { classNames } from "@/lib/utilities/class-names";

type ProjectHealthBadgeProps = {
  readonly health: ProjectHealth | null;
  readonly className?: string;
};

export const ProjectHealthBadge = ({ health, className }: ProjectHealthBadgeProps) => {
  if (!health) {
    return <span className={classNames("text-xs text-foreground-quaternary", className)}>No update</span>;
  }
  const definition = projectHealthDefinition(health);
  return (
    <span className={classNames("inline-flex items-center gap-1.5 text-xs text-foreground-secondary", className)}>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: definition.color }} />
      {definition.name}
    </span>
  );
};
