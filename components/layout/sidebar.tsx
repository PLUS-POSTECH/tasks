"use client";

import { useState } from "react";

import { useCommandPalette } from "@/components/command-palette/command-palette-context";
import { useCreateIssueDialog } from "@/components/issues/create-issue/create-issue-dialog-context";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Kbd } from "@/components/ui/kbd";
import { MenuItem } from "@/components/ui/menu-item";
import { Popover } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { useModifierKeyLabel } from "@/components/ui/use-modifier-key-label";
import { WorkspaceBadge } from "@/components/workspace/workspace-badge";
import type { ThemePreference } from "@/lib/session/theme";
import type { WorkspaceSummary } from "@/lib/workspace/queries";
import { classNames } from "@/lib/utilities/class-names";

import { SidebarLink } from "./sidebar-link";
import { useSidebar } from "./sidebar-provider";
import { SidebarSection } from "./sidebar-section";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

type SidebarProps = {
  readonly workspace: WorkspaceSummary;
  readonly unreadCount: number;
  readonly themePreference: ThemePreference;
};

export const Sidebar = ({
  workspace,
  unreadCount,
  themePreference,
}: SidebarProps) => {
  const { openCreateIssue } = useCreateIssueDialog();
  const { openCommandPalette } = useCommandPalette();
  const modifierKeyLabel = useModifierKeyLabel();
  const { mobileOpen, setMobileOpen } = useSidebar();
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <aside className="hidden w-12 shrink-0 flex-col items-center gap-2 border-r border-border bg-sidebar py-3 md:flex">
        <IconButton
          size="rail"
          tone="muted"
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
        >
          <Icon name="panel-left" size={15} />
        </IconButton>
        <IconButton
          size="rail"
          tone="muted"
          onClick={() => openCreateIssue()}
          aria-label="New issue"
        >
          <Icon name="edit" size={15} />
        </IconButton>
        <IconButton
          size="rail"
          tone="muted"
          onClick={() => openCommandPalette()}
          aria-label="Search"
        >
          <Icon name="search" size={15} />
        </IconButton>
      </aside>
    );
  }

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-overlay md:hidden"
        />
      ) : null}
    <aside
      className={classNames(
        "fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] shrink-0 flex-col border-r border-border bg-sidebar transition-transform md:static md:z-auto md:w-[244px] md:max-w-none md:translate-x-0",
        mobileOpen ? "translate-x-0 shadow-dialog" : "-translate-x-full md:shadow-none",
      )}
    >
      <div className="flex h-12 items-center gap-1 px-2.5 md:h-11">
        <Popover
          trigger={
            <button
              type="button"
              className="flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-medium text-foreground hover:bg-background-tertiary"
              aria-label="Workspace menu"
            >
              <WorkspaceBadge name={workspace.name} iconUrl={workspace.iconUrl} size={18} className="rounded" />
              <span className="truncate">{workspace.name}</span>
              <Icon name="chevron-down" size={12} className="text-foreground-tertiary" />
            </button>
          }
        >
          {(close) => (
            <div className="flex w-[240px] flex-col p-1 text-[13px]">
              <div className="px-2 py-1.5 text-xs text-foreground-tertiary">{workspace.slug}.tasks</div>
              <MenuItem as="link" href="/settings" onClick={close}>
                <Icon name="settings" size={14} className="text-foreground-tertiary" /> Workspace settings
                <span className="flex-1" />
                <Kbd keys="G S" />
              </MenuItem>
              <MenuItem as="link" href="/settings/members" onClick={close}>
                <Icon name="user-plus" size={14} className="text-foreground-tertiary" /> Invite and manage members
              </MenuItem>
              <MenuItem as="link" href="/settings/workflow" onClick={close}>
                <Icon name="circle" size={14} className="text-foreground-tertiary" /> Workflow
              </MenuItem>
              <MenuItem as="link" href="/settings/labels" onClick={close}>
                <Icon name="tag" size={14} className="text-foreground-tertiary" /> Labels
              </MenuItem>
            </div>
          )}
        </Popover>
        <span className="flex-1" />
        <Tooltip label="Search" shortcut={`${modifierKeyLabel} K`} side="bottom">
          <IconButton
            size="rail"
            tone="muted"
            onClick={() => openCommandPalette()}
            aria-label="Search"
          >
            <Icon name="search" size={15} />
          </IconButton>
        </Tooltip>
        <Tooltip label="New issue" shortcut="C" side="bottom">
          <button
            type="button"
            onClick={() => openCreateIssue()}
            aria-label="New issue"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-foreground-secondary shadow-sm hover:bg-background-tertiary hover:text-foreground"
          >
            <Icon name="edit" size={14} />
          </button>
        </Tooltip>
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-4">
        <div className="flex flex-col gap-px">
          <SidebarLink
            href="/inbox"
            icon={<Icon name="inbox" size={15} />}
            badge={
              unreadCount > 0 ? (
                <span className="rounded-full bg-accent-muted px-1.5 text-2xs font-medium text-accent tabular-nums">
                  {unreadCount}
                </span>
              ) : null
            }
          >
            Inbox
          </SidebarLink>
          <SidebarLink href="/my-issues" icon={<Icon name="my-issues" size={15} />}>
            My issues
          </SidebarLink>
        </div>

        <SidebarSection title="Workspace">
          <SidebarLink href="/issues" icon={<Icon name="issues" size={15} />} matchPrefixes={["/issues/"]}>
            Issues
          </SidebarLink>
          <SidebarLink href="/issues/active" depth={1}>
            Active
          </SidebarLink>
          <SidebarLink href="/issues/backlog" depth={1}>
            Backlog
          </SidebarLink>
          <SidebarLink href="/issues" depth={1} exact>
            All
          </SidebarLink>
          <SidebarLink href="/projects" icon={<Icon name="projects" size={15} />} matchPrefixes={["/project/"]}>
            Projects
          </SidebarLink>
        </SidebarSection>

      </nav>

      <div className={classNames("flex h-12 items-center gap-1 border-t border-border px-2 md:h-11")}>
        <UserMenu />
        <span className="flex-1" />
        <ThemeToggle initialPreference={themePreference} />
        <Tooltip label="Keyboard shortcuts" shortcut="?" side="top" className="hidden md:inline-flex">
          <IconButton
            size="rail"
            tone="muted"
            aria-label="Keyboard shortcuts"
            onClick={() => window.dispatchEvent(new CustomEvent("tasks:show-shortcuts"))}
          >
            <Icon name="keyboard" size={15} />
          </IconButton>
        </Tooltip>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse sidebar"
          className="hidden h-7 w-7 items-center justify-center rounded-md text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground md:flex"
        >
          <Icon name="panel-left" size={15} />
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
          className="flex h-8 w-8 items-center justify-center rounded-md text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground md:hidden"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </aside>
    </>
  );
};
