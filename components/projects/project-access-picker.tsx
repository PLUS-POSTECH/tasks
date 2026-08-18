"use client";

import Link from "next/link";
import { useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import { Popover } from "@/components/ui/popover";
import { PropertyButton } from "@/components/ui/property-button";
import { SelectMenu } from "@/components/ui/select-menu";
import type { DiscordRole } from "@/lib/discord/api";
import { setProjectAccessRoles } from "@/lib/projects/actions";
import type { ProjectAccessRole } from "@/lib/projects/queries";

import { accessMenuRoles } from "./project-access-roles";

type ProjectAccessPickerProps = {
  readonly projectIdentifier: string;
  readonly accessRoles: readonly ProjectAccessRole[];
  /** Roles of the Discord server; null when the bot is not configured. */
  readonly discordRoles: readonly DiscordRole[] | null;
  /** Issues filed under the project — what opening it up puts in front of everyone. */
  readonly issueCount: number;
  readonly canManage: boolean;
};

const countedNoun = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;

const roleColor = (color: number): string => (color === 0 ? "currentColor" : `#${color.toString(16).padStart(6, "0")}`);

const summarize = (roles: readonly ProjectAccessRole[]): string =>
  roles.length === 0
    ? "Everyone"
    : roles.length <= 2
      ? roles.map((role) => `@${role.name}`).join(", ")
      : `@${roles[0]?.name} +${roles.length - 1}`;

/** Nothing selected keeps the project open to the whole workspace. */
export const ProjectAccessPicker = ({
  projectIdentifier,
  accessRoles,
  discordRoles,
  issueCount,
  canManage,
}: ProjectAccessPickerProps) => {
  const [, startTransition] = useTransition();
  const selected = accessRoles.map((role) => role.identifier);

  const trigger = (
    <PropertyButton
      variant="row"
      muted={accessRoles.length === 0}
      icon={<Icon name={accessRoles.length === 0 ? "users" : "lock"} size={14} />}
      disabled={!canManage}
      title={canManage ? undefined : "Only admins and the project lead can change access."}
    >
      {summarize(accessRoles)}
    </PropertyButton>
  );

  if (!canManage) {
    return trigger;
  }

  /**
   * Emptying the role list is the one change here that widens access, and it
   * widens it to the whole workspace, so it is confirmed. Both ways of getting
   * there — the menu and "Remove restrictions" — come through here.
   */
  const applyRoles = (next: readonly ProjectAccessRole[]) => {
    const opensUp =
      issueCount === 0
        ? "It has no issues in it yet."
        : `It makes ${countedNoun(issueCount, "issue")} visible to every member.`;
    if (next.length === 0 && !window.confirm(`Open this project to everyone in the workspace? ${opensUp}`)) {
      return;
    }
    startTransition(() => setProjectAccessRoles(projectIdentifier, next));
  };

  const toggle = (roleIdentifier: string) => {
    const known = new Map<string, string>([
      ...accessRoles.map((role): [string, string] => [role.identifier, role.name]),
      ...(discordRoles ?? []).map((role): [string, string] => [role.id, role.name]),
    ]);
    const nextIdentifiers = selected.includes(roleIdentifier)
      ? selected.filter((identifier) => identifier !== roleIdentifier)
      : [...selected, roleIdentifier];
    applyRoles(
      nextIdentifiers.flatMap((identifier) => {
        const name = known.get(identifier);
        return name ? [{ identifier, name }] : [];
      }),
    );
  };

  if (discordRoles === null) {
    return (
      <Popover trigger={trigger}>
        <div className="flex max-w-[280px] flex-col gap-2 p-3 text-xs text-foreground-secondary">
          <p>Add a Discord bot token in settings to pick server roles for this project.</p>
          <Link href="/settings" className="text-accent hover:underline">
            Open workspace settings →
          </Link>
          {accessRoles.length > 0 ? (
            <button
              type="button"
              onClick={() => applyRoles([])}
              className="self-start text-danger hover:underline"
            >
              Remove restrictions
            </button>
          ) : null}
        </div>
      </Popover>
    );
  }

  return (
    <Popover trigger={trigger}>
      <SelectMenu
        multiple
        items={accessMenuRoles(accessRoles, discordRoles).map((role) => ({
          value: role.identifier,
          label: role.name,
          description: role.onServer ? undefined : "No longer on the server",
          icon: (
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: role.onServer ? roleColor(role.color) : "currentColor" }}
            />
          ),
        }))}
        selectedValues={selected}
        searchPlaceholder="Restrict to roles…"
        emptyMessage="No roles found"
        onSelect={toggle}
        footer={
          <div className="border-t border-border px-3 py-2 text-2xs text-foreground-tertiary">
            {selected.length === 0 ? "Open to everyone in the workspace." : "Admins, the lead and project members always keep access."}
          </div>
        }
      />
    </Popover>
  );
};
