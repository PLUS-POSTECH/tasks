"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { TextInput } from "@/components/ui/text-input";
import { Timestamp } from "@/components/ui/timestamp";
import { createApiToken, revokeApiToken } from "@/lib/api-tokens/actions";
import type { ApiTokenSummary } from "@/lib/api-tokens/queries";

import { SettingsSection } from "./settings-section";

type ApiTokensManagerProps = {
  readonly tokens: readonly ApiTokenSummary[];
  readonly baseUrl: string;
};

export const ApiTokensManager = ({ tokens, baseUrl }: ApiTokensManagerProps) => {
  const [name, setName] = useState("");
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <SettingsSection
      title="API tokens"
      description={`Tokens act as you for programmatic clients. Point an MCP client at ${baseUrl}/api/mcp, or call ${baseUrl}/api/operations directly, sending “Authorization: Bearer <token>”. Shown once at creation.`}
    >
      <form
        className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const created = await createApiToken(name);
            setFreshToken(created.token);
            setCopied(false);
            setName("");
          });
        }}
      >
        <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Token name, e.g. Claude Desktop" aria-label="Token name" className="flex-1" />
        <Button variant="primary" type="submit" disabled={pending || name.trim().length === 0}>
          Create token
        </Button>
      </form>
      {freshToken ? (
        <div className="flex flex-col gap-2 border-b border-border bg-accent-muted px-4 py-3">
          <p className="text-xs text-foreground-secondary">Copy this token now — it will not be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground">{freshToken}</code>
            <Button
              variant="secondary"
              size="small"
              onClick={() =>
                navigator.clipboard.writeText(freshToken).then(() => setCopied(true))
              }
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" size="small" onClick={() => setFreshToken(null)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
      {tokens.length === 0 ? <p className="px-4 py-3 text-xs text-foreground-quaternary">No tokens yet.</p> : null}
      {tokens.map((token) => (
        <div key={token.identifier} className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-b-0">
          <Icon name="link" size={14} className="shrink-0 text-foreground-tertiary" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-foreground">{token.name}</div>
            <div className="text-xs text-foreground-tertiary">
              <span className="font-mono">{token.tokenPrefix}…</span> · <Timestamp value={token.createdAt} format="relative" prefix="created" />
              {token.lastUsedAt ? (
                <>
                  {" · "}
                  <Timestamp value={token.lastUsedAt} format="relative" prefix="last used" />
                </>
              ) : (
                " · never used"
              )}
            </div>
          </div>
          <IconButton
            size="inline"
            tone="subtle-danger"
            aria-label={`Revoke token ${token.name}`}
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Revoke token "${token.name}"? Clients using it stop working immediately.`)) {
                startTransition(() => revokeApiToken(token.identifier));
              }
            }}
          >
            <Icon name="trash" size={14} />
          </IconButton>
        </div>
      ))}
    </SettingsSection>
  );
};
