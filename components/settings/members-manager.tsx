"use client";

import { useState, useTransition } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Switch } from "@/components/ui/switch";
import { Timestamp } from "@/components/ui/timestamp";
import { useToast } from "@/components/ui/toast-provider";
import { removeMember, setMemberAdmin, syncMembersNow } from "@/lib/settings/actions";
import type { MemberListItem } from "@/lib/users/queries";
import { classNames } from "@/lib/utilities/class-names";
import type { DiscordSyncHealth } from "@/lib/workspace/queries";

import { AdminOnlyNotice } from "./admin-only-notice";
import { SettingsSection } from "./settings-section";

/** Why someone is an admin. Only "granted" is editable here; the rest come from Discord. */
const adminReasonLabels = {
  owner: "Server owner",
  administrator_role: "Discord admin role",
  admin_role: "Admin role",
} as const;

type MembersManagerProps = {
  readonly members: readonly MemberListItem[];
  readonly currentUserIdentifier: string;
  readonly canSync: boolean;
  readonly syncHealth: DiscordSyncHealth | null;
  /** False for members, who may read the list but not grant admin or remove anyone. */
  readonly canManage: boolean;
};

export const MembersManager = ({ members, currentUserIdentifier, canSync, syncHealth, canManage }: MembersManagerProps) => {
  const [pending, startTransition] = useTransition();
  const [showFormer, setShowFormer] = useState(false);
  const { showToast } = useToast();
  const current = members.filter((member) => !member.hasLeft);
  const former = members.filter((member) => member.hasLeft);
  const visible = showFormer ? members : current;

  return (
    <SettingsSection
      title={`Members · ${current.length}`}
      description={
        canSync
          ? "Mirrors the Discord server: everyone in the server is a member, names and pictures follow Discord, and people who leave are shown as “Former member”. Synced every 10 minutes."
          : "Anyone in the workspace's Discord server becomes a member when they sign in. Add a bot token in Workspace settings to mirror the whole server automatically."
      }
      actions={
        <div className="flex items-center gap-2">
          {former.length > 0 ? (
            <Button variant="ghost" size="small" onClick={() => setShowFormer((value) => !value)}>
              {showFormer ? "Hide former" : `Show former (${former.length})`}
            </Button>
          ) : null}
          {canSync ? (
            <Button
              variant="secondary"
              size="small"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await syncMembersNow();
                  if (!result.ok) {
                    showToast({ title: "Sync failed", description: result.error, tone: "danger" });
                    return;
                  }
                  const { name, total, added, updated, left, sweepRefusal } = result.value;
                  const counts = `${total} members · ${added} added · ${updated} updated`;
                  showToast(
                    sweepRefusal === null
                      ? { title: `Synced “${name}”`, description: `${counts} · ${left} left`, tone: "success" }
                      : {
                          title: `Synced “${name}”, with nobody marked as left`,
                          description: `${counts}. Nobody was flagged as having left because ${sweepRefusal}.`,
                          tone: "neutral",
                        },
                  );
                })
              }
            >
              {pending ? "Syncing…" : "Sync from Discord"}
            </Button>
          ) : null}
        </div>
      }
    >
      {canManage ? null : <AdminOnlyNotice change="grant admin or remove members" />}
      {syncHealth ? (
        <div className="flex items-start gap-2 border-b border-border px-4 py-2.5 text-xs last:border-b-0">
          <Icon
            name={syncHealth.error ? "alert-circle" : "check-circle"}
            size={14}
            className={classNames("mt-px shrink-0", syncHealth.error ? "text-danger" : "text-foreground-quaternary")}
          />
          <div className="min-w-0 flex-1">
            {syncHealth.error ? (
              <>
                <p className="text-danger">Last sync: {syncHealth.error}</p>
                <p className="text-foreground-tertiary">
                  {syncHealth.syncedAt ? (
                    <>
                      This list is the server as it was{" "}
                      <Timestamp value={syncHealth.syncedAt} format="relative" />. Anybody who has left since then still has
                      their access here.
                    </>
                  ) : (
                    "The server has never been read, so nobody here follows it yet."
                  )}
                </p>
              </>
            ) : syncHealth.syncedAt ? (
              <p className="text-foreground-tertiary">
                <Timestamp value={syncHealth.syncedAt} format="relative" prefix="Mirrored from Discord" />.
              </p>
            ) : (
              <p className="text-foreground-tertiary">The Discord server has not been read yet.</p>
            )}
          </div>
        </div>
      ) : null}
      {visible.map((member) => (
        <div
          key={member.identifier}
          className={classNames("flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0", member.hasLeft ? "opacity-60" : "")}
        >
          <Avatar name={member.name} color={member.avatarColor} image={member.image} size={28} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-foreground">
              {member.name}
              {member.identifier === currentUserIdentifier ? <span className="ml-1 text-xs font-normal text-foreground-tertiary">(you)</span> : null}
              {member.hasLeft ? <span className="ml-2 rounded bg-background-tertiary px-1.5 py-0.5 text-2xs font-normal text-foreground-tertiary">Left the server</span> : null}
            </div>
            <div className="truncate text-xs text-foreground-tertiary">
              @{member.displayName}
              {/* Only admins are sent e-mail addresses, so only they can be shown one. */}
              {member.administered ? ` · ${member.email ?? "Not signed in yet"}` : null}
            </div>
          </div>
          {member.administered && member.adminReason && member.adminReason !== "granted" ? (
            <span
              className="rounded bg-background-tertiary px-1.5 py-0.5 text-2xs text-foreground-tertiary"
              title="Admin comes from the Discord server and cannot be changed here."
            >
              {adminReasonLabels[member.adminReason]}
            </span>
          ) : canManage ? (
            <label className="flex items-center gap-2 text-xs text-foreground-tertiary">
              Admin
              <Switch
                checked={member.isAdmin}
                label={`Admin: ${member.name}`}
                onChange={(checked) => startTransition(() => setMemberAdmin(member.identifier, checked))}
              />
            </label>
          ) : member.isAdmin ? (
            <span className="rounded bg-background-tertiary px-1.5 py-0.5 text-2xs text-foreground-tertiary">Admin</span>
          ) : null}
          {canManage ? (
            <IconButton
              size="inline"
              tone="subtle-danger"
              className="disabled:opacity-30"
              disabled={member.identifier === currentUserIdentifier || pending || (member.followsDiscord && !member.hasLeft)}
              title={member.followsDiscord && !member.hasLeft ? "Membership follows the Discord server; remove them there." : undefined}
              onClick={() => {
                if (window.confirm(`Remove ${member.name} from the workspace?`)) {
                  startTransition(() => removeMember(member.identifier));
                }
              }}
              aria-label={`Remove ${member.name}`}
            >
              <Icon name="trash" size={14} />
            </IconButton>
          ) : null}
        </div>
      ))}
    </SettingsSection>
  );
};
