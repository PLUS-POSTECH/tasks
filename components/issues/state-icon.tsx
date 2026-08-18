import { StatusGlyph, type StatusGlyphShape } from "@/components/ui/status-glyph";
import type { WorkflowStateType } from "@/lib/database/schema/enum-values";

type StateIconProps = {
  readonly type: WorkflowStateType;
  readonly color: string;
  readonly progress?: number;
  readonly size?: number;
  readonly className?: string;
};

const shapes: Readonly<Record<WorkflowStateType, StatusGlyphShape>> = {
  backlog: "dashed",
  unstarted: "outline",
  started: "progress",
  completed: "done",
  canceled: "canceled",
};

export const StateIcon = ({ type, color, progress = 0.5, size = 14, className }: StateIconProps) => (
  <StatusGlyph shape={shapes[type]} color={color} progress={progress} size={size} className={className} />
);
