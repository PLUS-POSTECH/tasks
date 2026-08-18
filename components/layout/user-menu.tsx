"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { MenuItem } from "@/components/ui/menu-item";
import { Popover } from "@/components/ui/popover";
import { useWorkspaceData } from "@/components/workspace/workspace-data-provider";
import { authClient } from "@/lib/auth/client";

export const UserMenu = () => {
  const { currentUser } = useWorkspaceData();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <Popover
      side="top"
      align="start"
      trigger={
        <button
          type="button"
          className="flex h-7 max-w-full items-center gap-2 rounded-md px-1.5 text-[13px] text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
          aria-label="Account"
        >
          <Avatar name={currentUser.name} color={currentUser.avatarColor} image={currentUser.image} size={18} />
          <span className="truncate">{currentUser.name}</span>
        </button>
      }
    >
      {(close) => (
        <div className="flex w-[240px] flex-col">
          <div className="border-b border-border px-3 py-2">
            <div className="text-[13px] font-medium text-foreground">{currentUser.name}</div>
            <div className="text-xs text-foreground-tertiary">{currentUser.email}</div>
          </div>
          <div className="flex flex-col p-1">
            <MenuItem as="link" href="/settings/account" onClick={close}>
              <Icon name="user" size={14} className="text-foreground-tertiary" /> Account settings
            </MenuItem>
            <MenuItem as="link" href="/settings" onClick={close}>
              <Icon name="settings" size={14} className="text-foreground-tertiary" /> Workspace settings
            </MenuItem>
            <MenuItem
              as="button"
              disabled={signingOut}
              className="disabled:opacity-50"
              onClick={async () => {
                setSigningOut(true);
                await authClient.signOut();
                router.push("/login");
                router.refresh();
              }}
            >
              <Icon name="arrow-left" size={14} className="text-foreground-tertiary" />
              {signingOut ? "Signing out…" : "Sign out"}
            </MenuItem>
          </div>
        </div>
      )}
    </Popover>
  );
};
