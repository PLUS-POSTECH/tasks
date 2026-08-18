"use client";

import { useState, useSyncExternalStore, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { useToast } from "@/components/ui/toast-provider";
import { WorkspaceBadge } from "@/components/workspace/workspace-badge";
import { updateWorkspace } from "@/lib/settings/actions";
import type { WorkspaceSummary } from "@/lib/workspace/queries";

import { AdminOnlyNotice } from "./admin-only-notice";
import { SettingsField } from "./settings-field";
import { SettingsSection } from "./settings-section";

const noTimeZones: readonly string[] = [];
const subscribeToNothing = () => () => undefined;
let browserTimeZones: readonly string[] | null = null;
const readBrowserTimeZones = (): readonly string[] =>
  (browserTimeZones ??= typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : noTimeZones);

type WorkspaceFormProps = {
  readonly workspace: WorkspaceSummary;
  /** True when a Discord bot is configured, so the server owns the name and icon. */
  readonly mirrorsDiscord: boolean;
  /** False for members, who may read the workspace settings but not change them. */
  readonly canManage: boolean;
};

export const WorkspaceForm = ({ workspace, mirrorsDiscord, canManage }: WorkspaceFormProps) => {
  const [name, setName] = useState(workspace.name);
  const [slug, setSlug] = useState(workspace.slug);
  const [timezone, setTimezone] = useState(workspace.timezone);
  // Client-only: the server's zone list may differ from the browser's.
  const timeZoneSuggestions = useSyncExternalStore(subscribeToNothing, readBrowserTimeZones, () => noTimeZones);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();
  const dirty = (!mirrorsDiscord && name !== workspace.name) || slug !== workspace.slug || timezone !== workspace.timezone;

  return (
    <SettingsSection
      title="Workspace"
      description={
        mirrorsDiscord
          ? "The name and icon follow the connected Discord server."
          : "Name and URL of this workspace."
      }
      actions={
        canManage ? (
          <Button
            variant="primary"
            size="small"
            disabled={!dirty || pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await updateWorkspace({ ...(mirrorsDiscord ? {} : { name }), slug, timezone });
                  setError(null);
                  showToast({ title: "Workspace updated", tone: "success" });
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "Failed to save.");
                }
              })
            }
          >
            Save
          </Button>
        ) : undefined
      }
    >
      {canManage ? null : <AdminOnlyNotice change="change these settings" />}
      <SettingsField
        label="Name"
        description={mirrorsDiscord ? "Mirrored from Discord; rename the server there." : undefined}
        htmlFor={mirrorsDiscord || !canManage ? undefined : "workspace-name"}
      >
        {mirrorsDiscord ? (
          <span className="flex min-w-0 items-center gap-2 text-[13px] text-foreground">
            <WorkspaceBadge name={workspace.name} iconUrl={workspace.iconUrl} size={20} className="rounded" />
            <span className="truncate">{workspace.name}</span>
          </span>
        ) : canManage ? (
          <TextInput id="workspace-name" value={name} onChange={(event) => setName(event.target.value)} />
        ) : (
          <span className="min-w-0 truncate text-[13px] text-foreground">{workspace.name}</span>
        )}
      </SettingsField>
      <SettingsField label="URL" description="Lowercase letters, numbers, and dashes." htmlFor={canManage ? "workspace-slug" : undefined}>
        {canManage ? (
          <TextInput id="workspace-slug" value={slug} onChange={(event) => setSlug(event.target.value)} />
        ) : (
          <span className="min-w-0 truncate text-[13px] text-foreground">{workspace.slug}</span>
        )}
      </SettingsField>
      <SettingsField
        label="Time zone"
        description="IANA name used for due dates and reminder times, e.g. Asia/Seoul."
        htmlFor={canManage ? "workspace-timezone" : undefined}
      >
        {canManage ? (
          <>
            <TextInput
              id="workspace-timezone"
              list="workspace-timezone-options"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="font-mono"
            />
            <datalist id="workspace-timezone-options">
              {timeZoneSuggestions.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          </>
        ) : (
          <span className="min-w-0 truncate font-mono text-[13px] text-foreground">{workspace.timezone}</span>
        )}
      </SettingsField>
      {error ? <p className="px-4 py-2 text-xs text-danger">{error}</p> : null}
    </SettingsSection>
  );
};
