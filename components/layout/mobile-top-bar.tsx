"use client";

import { useCommandPalette } from "@/components/command-palette/command-palette-context";
import { useCreateIssueDialog } from "@/components/issues/create-issue/create-issue-dialog-context";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { WorkspaceBadge } from "@/components/workspace/workspace-badge";
import type { WorkspaceSummary } from "@/lib/workspace/queries";

import { useSidebar } from "./sidebar-provider";

type MobileTopBarProps = {
  readonly workspace: WorkspaceSummary;
};

export const MobileTopBar = ({ workspace }: MobileTopBarProps) => {
  const { setMobileOpen } = useSidebar();
  const { openCommandPalette } = useCommandPalette();
  const { openCreateIssue } = useCreateIssueDialog();
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-sidebar px-2 md:hidden">
      <IconButton
        size="touch"
        tone="secondary"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
      >
        <Icon name="panel-left" size={18} />
      </IconButton>
      <span className="flex min-w-0 flex-1 items-center gap-2 px-1 text-[13px] font-medium text-foreground">
        <WorkspaceBadge name={workspace.name} iconUrl={workspace.iconUrl} size={20} className="rounded" />
        <span className="truncate">{workspace.name}</span>
      </span>
      <IconButton
        size="touch"
        tone="secondary"
        onClick={() => openCommandPalette()}
        aria-label="Search"
      >
        <Icon name="search" size={17} />
      </IconButton>
      <IconButton
        size="touch"
        tone="secondary"
        onClick={() => openCreateIssue()}
        aria-label="New issue"
      >
        <Icon name="edit" size={17} />
      </IconButton>
    </div>
  );
};
