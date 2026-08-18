import type { ReactNode } from "react";

import { classNames } from "@/lib/utilities/class-names";

type EmptyStateProps = {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
  /** Stretch to fill the surrounding flex column; views inside a scroll container need this to centre. */
  readonly fill?: boolean;
};

export const EmptyState = ({
  icon,
  title,
  description,
  action,
  fill = false,
}: EmptyStateProps) => (
  <div
    className={classNames(
      "flex",
      fill ? "flex-1" : undefined,
      "flex-col items-center justify-center gap-2 px-6 py-24 text-center",
    )}
  >
    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-foreground-tertiary">
      {icon}
    </div>
    <div className="text-sm font-medium text-foreground">{title}</div>
    <div className="max-w-xs text-xs text-foreground-tertiary">{description}</div>
    {action}
  </div>
);
