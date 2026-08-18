"use client";

import { useState, useTransition } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ColorSwatches } from "@/components/ui/color-swatches";
import { TextInput } from "@/components/ui/text-input";
import { useToast } from "@/components/ui/toast-provider";
import type { CurrentUser } from "@/lib/session/current-user";
import { updateOwnProfile } from "@/lib/settings/actions";

import { SettingsField } from "./settings-field";
import { SettingsSection } from "./settings-section";

type ProfileFormProps = {
  readonly user: CurrentUser;
  /** True when a Discord bot is configured, so the server owns every member's name and handle. */
  readonly mirrorsDiscord: boolean;
};

const avatarColors = ["#5e6ad2", "#26b5ce", "#f2994a", "#eb5757", "#27ae60", "#bb87fc", "#f7c948", "#4ea7fc"] as const;

export const ProfileForm = ({ user, mirrorsDiscord }: ProfileFormProps) => {
  const [name, setName] = useState(user.name);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email);
  const [avatarColor, setAvatarColor] = useState(user.avatarColor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();
  const dirty =
    (!mirrorsDiscord && (name !== user.name || displayName !== user.displayName)) ||
    email !== user.email ||
    avatarColor !== user.avatarColor;

  return (
    <SettingsSection
      title="Profile"
      description="How you appear to teammates."
      actions={
        <Button
          variant="primary"
          size="small"
          disabled={!dirty || pending}
          onClick={() =>
            startTransition(async () => {
              try {
                const result = await updateOwnProfile({
                  ...(mirrorsDiscord ? {} : { name, displayName }),
                  email,
                  avatarColor,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setError(null);
                showToast({ title: "Profile updated", tone: "success" });
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Failed to save.");
              }
            })
          }
        >
          Save
        </Button>
      }
    >
      <SettingsField label="Avatar">
        <div className="flex items-center gap-2">
          <Avatar name={name} color={avatarColor} image={user.image} size={28} />
          <ColorSwatches
            choices={avatarColors}
            value={avatarColor}
            onSelect={setAvatarColor}
            size={16}
            ariaLabelPrefix="Color"
          />
        </div>
      </SettingsField>
      <SettingsField
        label="Full name"
        description={mirrorsDiscord ? "Follows your name on Discord; change it there." : undefined}
        htmlFor="profile-name"
      >
        <TextInput
          id="profile-name"
          value={name}
          disabled={mirrorsDiscord}
          onChange={(event) => setName(event.target.value)}
        />
      </SettingsField>
      <SettingsField
        label="Username"
        description={mirrorsDiscord ? "Follows your username on Discord; change it there." : undefined}
        htmlFor="profile-display-name"
      >
        <TextInput
          id="profile-display-name"
          value={displayName}
          disabled={mirrorsDiscord}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </SettingsField>
      <SettingsField label="Email" htmlFor="profile-email">
        <TextInput id="profile-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </SettingsField>
      {error ? <p className="px-4 py-2 text-xs text-danger">{error}</p> : null}
    </SettingsSection>
  );
};
