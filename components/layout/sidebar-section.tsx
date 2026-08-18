"use client";

import { useState, type ReactNode } from "react";

import { Icon } from "@/components/ui/icon";
import { classNames } from "@/lib/utilities/class-names";

type SidebarSectionProps = {
  readonly title: string;
  readonly children: ReactNode;
};

export const SidebarSection = ({ title, children }: SidebarSectionProps) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-4">
      <div className="group/section flex h-6 items-center gap-1 pl-2 pr-1">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1 rounded text-2xs font-medium uppercase tracking-wide text-foreground-quaternary hover:text-foreground-tertiary"
        >
          <span className="truncate">{title}</span>
          <Icon
            name="chevron-down"
            size={10}
            className={classNames(
              "opacity-0 transition-all group-hover/section:opacity-100",
              open ? "" : "-rotate-90",
            )}
          />
        </button>
      </div>
      {open ? <div className="mt-0.5 flex flex-col gap-px">{children}</div> : null}
    </div>
  );
};
