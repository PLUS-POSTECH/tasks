import type { ReactNode } from "react";

import { classNames } from "@/lib/utilities/class-names";

import { Kbd } from "./kbd";

type TooltipProps = {
  readonly label: string;
  readonly shortcut?: string;
  readonly side?: "top" | "bottom" | "right";
  readonly children: ReactNode;
  readonly className?: string;
};

const sideClasses = {
  top: "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-1.5 -translate-x-1/2",
  right: "left-full top-1/2 ml-1.5 -translate-y-1/2",
} as const;

export const Tooltip = ({
  label,
  shortcut,
  side = "top",
  children,
  className,
}: TooltipProps) => (
  <span className={classNames("group/tooltip relative inline-flex", className)}>
    {children}
    <span
      role="tooltip"
      className={classNames(
        "pointer-events-none absolute z-50 flex items-center gap-1.5 whitespace-nowrap rounded-md bg-surface-raised px-2 py-1 text-xs text-foreground opacity-0 shadow-popover transition-opacity delay-300 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100",
        sideClasses[side],
      )}
    >
      {label}
      {shortcut ? <Kbd keys={shortcut} /> : null}
    </span>
  </span>
);
