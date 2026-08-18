import Link from "next/link";

import { Icon } from "@/components/ui/icon";

import { SettingsNavItem } from "./settings-nav-item";

export const SettingsNav = () => (
  <nav className="no-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-sidebar px-2 py-2 md:w-[220px] md:flex-col md:items-stretch md:gap-4 md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-4">
    <Link href="/" className="flex shrink-0 items-center gap-1.5 px-2 text-xs text-foreground-tertiary hover:text-foreground">
      <Icon name="arrow-left" size={12} /> <span className="hidden md:inline">Back to app</span>
    </Link>
    <div className="flex items-center gap-1 md:block">
      <div className="hidden px-2 pb-1 text-2xs font-medium uppercase tracking-wide text-foreground-quaternary md:block">Workspace</div>
      <SettingsNavItem href="/settings" label="General" exact />
      <SettingsNavItem href="/settings/members" label="Members" />
      <SettingsNavItem href="/settings/labels" label="Labels" />
      <SettingsNavItem href="/settings/workflow" label="Workflow" />
    </div>
    <div className="flex items-center gap-1 md:block">
      <div className="hidden px-2 pb-1 text-2xs font-medium uppercase tracking-wide text-foreground-quaternary md:block">Account</div>
      <SettingsNavItem href="/settings/account" label="Profile" />
    </div>
  </nav>
);
