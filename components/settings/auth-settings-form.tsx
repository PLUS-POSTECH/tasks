"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { updateAuthSettings } from "@/lib/auth/actions";
import { discordBotInviteUrl } from "@/lib/discord/urls";
import type { PublicAuthSettings } from "@/lib/auth/settings";

import { AdminOnlyNotice } from "./admin-only-notice";
import { CopyableValue } from "./copyable-value";
import { SettingsField } from "./settings-field";
import { SettingsSection } from "./settings-section";

type AuthSettingsFormProps = {
  readonly settings: PublicAuthSettings;
  readonly canManage?: boolean;
  /**
   * True once the workspace belongs to a Discord server, which fixes it:
   * pointing this deployment at another server would remove everyone who is in
   * this one. `updateAuthSettings` refuses the change either way — this only
   * stops the form from inviting it.
   */
  readonly guildFixed?: boolean;
  readonly title?: string;
  readonly description?: string;
};

export const AuthSettingsForm = ({
  settings,
  canManage = true,
  guildFixed = false,
  title = "Authentication",
  description = "Discord application used for sign-in and the server whose members are allowed.",
}: AuthSettingsFormProps) => {
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [clientIdentifier, setClientIdentifier] = useState(settings.discordClientIdentifier);
  const [clientSecret, setClientSecret] = useState("");
  const [guildIdentifier, setGuildIdentifier] = useState(settings.discordGuildIdentifier);
  /** New token to store, "" to keep the stored one, null to remove it. */
  const [botToken, setBotToken] = useState<string | null>("");
  const [adminRoles, setAdminRoles] = useState(settings.adminRoleIdentifiers.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty =
    baseUrl !== settings.baseUrl ||
    clientIdentifier !== settings.discordClientIdentifier ||
    clientSecret.length > 0 ||
    guildIdentifier !== settings.discordGuildIdentifier ||
    botToken !== "" ||
    adminRoles !== settings.adminRoleIdentifiers.join(", ");

  const save = () =>
    startTransition(async () => {
      try {
        await updateAuthSettings({
          baseUrl,
          discordClientIdentifier: clientIdentifier,
          discordClientSecret: clientSecret,
          discordGuildIdentifier: guildIdentifier,
          discordBotToken: botToken,
          adminRoleIdentifiers: adminRoles,
        });
        setClientSecret("");
        setBotToken("");
        setError(null);
        setSaved(true);
      } catch (caught) {
        setSaved(false);
        setError(caught instanceof Error ? caught.message : "Failed to save.");
      }
    });

  const callbackUrl = baseUrl.trim().length > 0 ? `${baseUrl.trim().replace(/\/+$/, "")}/api/auth/callback/discord` : null;

  return (
    <SettingsSection
      title={title}
      description={description}
      actions={
        canManage ? (
          <Button variant="primary" size="small" disabled={!dirty || pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </Button>
        ) : undefined
      }
    >
      {canManage ? null : <AdminOnlyNotice change="change how sign-in works" />}
      <SettingsField
        label="App URL"
        description="Public URL people open the app from, e.g. https://tasks.example.com."
        htmlFor={canManage ? "auth-base-url" : undefined}
      >
        {canManage ? (
          <TextInput id="auth-base-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://tasks.example.com" />
        ) : (
          <span className="min-w-0 truncate text-[13px] text-foreground">{settings.baseUrl || "Not set"}</span>
        )}
      </SettingsField>
      <SettingsField label="Discord client ID" description="Application ID from the Discord Developer Portal." htmlFor={canManage ? "auth-client-id" : undefined}>
        {canManage ? (
          <TextInput id="auth-client-id" value={clientIdentifier} onChange={(event) => setClientIdentifier(event.target.value)} className="font-mono" />
        ) : (
          <span className="min-w-0 truncate font-mono text-[13px] text-foreground">{settings.discordClientIdentifier || "Not set"}</span>
        )}
      </SettingsField>
      <SettingsField
        label="Discord client secret"
        description={
          settings.hasDiscordClientSecret
            ? canManage
              ? "A secret is stored. Enter a new one to replace it."
              : "A secret is stored."
            : "OAuth2 client secret."
        }
        htmlFor={canManage ? "auth-client-secret" : undefined}
      >
        {canManage ? (
          <TextInput
            id="auth-client-secret"
            type="password"
            autoComplete="off"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            placeholder={settings.hasDiscordClientSecret ? "••••••••••••" : ""}
          />
        ) : (
          <span className="text-[13px] text-foreground">{settings.hasDiscordClientSecret ? "Stored" : "Not set"}</span>
        )}
      </SettingsField>
      <SettingsField
        label="Redirect URI"
        description="Add this to the Discord application under OAuth2 › Redirects. It follows the app URL, so update it there whenever the URL changes."
      >
        {callbackUrl ? <CopyableValue value={callbackUrl} /> : <span className="text-xs text-foreground-quaternary">Enter the app URL first.</span>}
      </SettingsField>
      <SettingsField
        label="Discord server"
        description={
          guildFixed
            ? "Only members of this Discord server can sign in. It is fixed once set: another server would mean different members, so use a new deployment for one."
            : "Only members of this Discord server (by server ID) can sign in. Leave empty to block all sign-ins."
        }
        htmlFor={canManage && !guildFixed ? "auth-guild" : undefined}
      >
        {canManage && !guildFixed ? (
          <TextInput id="auth-guild" value={guildIdentifier} onChange={(event) => setGuildIdentifier(event.target.value)} placeholder="Right-click the server → Copy Server ID" className="font-mono" />
        ) : (
          <span className="min-w-0 truncate font-mono text-[13px] text-foreground">{settings.discordGuildIdentifier || "Not set"}</span>
        )}
      </SettingsField>
      <SettingsField
        label="Admin roles"
        description={
          canManage
            ? "Discord role IDs whose holders are admins here, comma separated. The server's owner and any role carrying Discord's Administrator permission are admins without being listed. Manageable later under Members."
            : "Discord roles whose holders are admins here, alongside the server's owner and its Administrator roles."
        }
        htmlFor={canManage ? "auth-admin-roles" : undefined}
      >
        {canManage ? (
          <TextInput
            id="auth-admin-roles"
            value={adminRoles}
            onChange={(event) => setAdminRoles(event.target.value)}
            placeholder="Server Settings → Roles → Copy Role ID"
            className="font-mono"
          />
        ) : (
          <span className="min-w-0 truncate font-mono text-[13px] text-foreground">
            {settings.adminRoleIdentifiers.join(", ") || "None"}
          </span>
        )}
      </SettingsField>
      <SettingsField
        label="Discord bot token"
        description={
          settings.hasDiscordBotToken
            ? "A bot token is stored; server roles and members are read with it. Enter a new token to replace it."
            : "Needed to restrict projects by server role. Create a bot on the application's Bot tab, paste its token here and invite it to the server."
        }
        htmlFor={canManage ? "auth-bot-token" : undefined}
      >
        {canManage ? (
          <>
            {botToken === null ? (
              <span className="flex-1 text-xs text-danger">Token will be removed on save.</span>
            ) : (
              <TextInput
                id="auth-bot-token"
                type="password"
                autoComplete="off"
                value={botToken}
                onChange={(event) => setBotToken(event.target.value)}
                placeholder={settings.hasDiscordBotToken ? "••••••••••••" : ""}
              />
            )}
            {settings.hasDiscordBotToken ? (
              <Button variant="ghost" size="small" onClick={() => setBotToken(botToken === null ? "" : null)}>
                {botToken === null ? "Keep" : "Remove"}
              </Button>
            ) : null}
          </>
        ) : (
          <span className="text-[13px] text-foreground">{settings.hasDiscordBotToken ? "Stored" : "Not set"}</span>
        )}
      </SettingsField>
      {clientIdentifier ? (
        <p className="px-4 py-2 text-xs text-foreground-tertiary">
          Invite the bot (no permissions needed):{" "}
          <a href={discordBotInviteUrl(clientIdentifier)} target="_blank" rel="noreferrer" className="break-all text-accent hover:underline">
            {discordBotInviteUrl(clientIdentifier)}
          </a>
        </p>
      ) : null}
      {error ? <p className="px-4 py-2 text-xs text-danger">{error}</p> : null}
      {saved && !error ? <p className="px-4 py-2 text-xs text-success">Saved. Sign-in now uses these settings.</p> : null}
    </SettingsSection>
  );
};
