"use client";

import Link from "next/link";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import { SelectMenu } from "@/components/ui/select-menu";
import type { DiscordRole } from "@/lib/discord/api";
import { setAdminRoles } from "@/lib/settings/actions";

import { AdminOnlyNotice } from "./admin-only-notice";
import { SettingsSection } from "./settings-section";

type AdminRolesManagerProps = {
  readonly selected: readonly string[];
  /** Roles of the Discord server; null when the bot is not configured. */
  readonly discordRoles: readonly DiscordRole[] | null;
  /** Roles that already grant admin because Discord itself says so. */
  readonly administratorRoleIdentifiers: readonly string[];
  readonly ownerName: string | null;
  /** False for members, who may read which roles grant admin but not change them. */
  readonly canManage: boolean;
};

const roleColor = (role: DiscordRole): string =>
  role.color === 0 ? "currentColor" : `#${role.color.toString(16).padStart(6, "0")}`;

export const AdminRolesManager = ({ selected, discordRoles, administratorRoleIdentifiers, ownerName, canManage }: AdminRolesManagerProps) => {
  const [pending, startTransition] = useTransition();
  const byIdentifier = new Map((discordRoles ?? []).map((role) => [role.id, role]));
  const chosen = selected.flatMap((identifier) => {
    const role = byIdentifier.get(identifier);
    return role ? [role] : [{ id: identifier, name: identifier, color: 0, position: 0, permissions: "0" }];
  });

  const toggle = (roleIdentifier: string) =>
    startTransition(() =>
      setAdminRoles(
        selected.includes(roleIdentifier) ? selected.filter((identifier) => identifier !== roleIdentifier) : [...selected, roleIdentifier],
      ),
    );

  return (
    <SettingsSection
      title="Admins"
      description={
        `Admin follows the Discord server: its owner${ownerName ? ` (${ownerName})` : ""} and anyone holding a role that carries Discord's Administrator permission.` +
        (canManage ? " Add roles here to grant it to people the server treats as senior without giving them that permission." : "")
      }
      actions={
        discordRoles === null || !canManage ? null : (
          <Popover
            align="end"
            trigger={
              <Button variant="secondary" size="small" disabled={pending}>
                Add role
              </Button>
            }
          >
            <SelectMenu
              multiple
              items={discordRoles.map((role) => ({
                value: role.id,
                label: role.name,
                description: administratorRoleIdentifiers.includes(role.id) ? "Already an admin on Discord" : undefined,
                disabled: administratorRoleIdentifiers.includes(role.id),
                icon: <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: roleColor(role) }} />,
              }))}
              selectedValues={[...selected, ...administratorRoleIdentifiers]}
              searchPlaceholder="Roles that grant admin…"
              emptyMessage="No roles found"
              onSelect={toggle}
            />
          </Popover>
        )
      }
    >
      {canManage ? null : <AdminOnlyNotice change="change which roles grant admin" />}
      {discordRoles === null ? (
        <p className="px-4 py-3 text-[13px] text-foreground-tertiary">
          Add a Discord bot token in{" "}
          <Link href="/settings" className="text-accent hover:underline">
            workspace settings
          </Link>{" "}
          to pick server roles.
        </p>
      ) : chosen.length === 0 && administratorRoleIdentifiers.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-foreground-tertiary">
          Only the server owner is an admin. Add a role to widen that.
        </p>
      ) : (
        <>
          {administratorRoleIdentifiers.map((identifier) => (
            <div key={identifier} className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-b-0">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: roleColor(byIdentifier.get(identifier) ?? { color: 0 } as DiscordRole) }}
              />
              <span className="min-w-0 flex-1 truncate text-foreground">@{byIdentifier.get(identifier)?.name ?? identifier}</span>
              <span className="text-xs text-foreground-tertiary">Administrator on Discord</span>
            </div>
          ))}
          {chosen.map((role) => (
            <div key={role.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-b-0">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: roleColor(role) }} />
              <span className="min-w-0 flex-1 truncate text-foreground">@{role.name}</span>
              {canManage ? (
                <Button variant="ghost" size="small" disabled={pending} onClick={() => toggle(role.id)}>
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
        </>
      )}
    </SettingsSection>
  );
};
