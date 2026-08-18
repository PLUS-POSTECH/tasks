"use client";

import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Popover } from "@/components/ui/popover";
import { SelectMenu } from "@/components/ui/select-menu";
import { setThemePreference } from "@/lib/session/actions";
import { themeClassName, themePreferences, type ThemePreference } from "@/lib/session/theme";

type ThemeToggleProps = {
  readonly initialPreference: ThemePreference;
};

const applyThemeClass = (preference: ThemePreference) => {
  const classList = document.documentElement.classList;
  classList.remove("light", "dark");
  const className = themeClassName(preference);
  if (className) {
    classList.add(className);
  }
};

const preferenceLabels: Readonly<Record<ThemePreference, string>> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export const ThemeToggle = ({ initialPreference }: ThemeToggleProps) => {
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);
  const [, startTransition] = useTransition();

  return (
    <Popover
      side="top"
      align="end"
      trigger={
        <IconButton
          size="rail"
          tone="muted"
          aria-label={`Theme: ${preferenceLabels[preference]}`}
          title="Theme"
        >
          <Icon name={preference === "dark" ? "moon" : preference === "light" ? "sun" : "monitor"} size={15} />
        </IconButton>
      }
    >
      {(close) => (
        <SelectMenu
          searchable={false}
          items={themePreferences.map((candidate) => ({
            value: candidate,
            label: preferenceLabels[candidate],
            icon: <Icon name={candidate === "dark" ? "moon" : candidate === "light" ? "sun" : "monitor"} size={14} />,
          }))}
          selectedValues={[preference]}
          onSelect={(value) => {
            const next = themePreferences.find((candidate) => candidate === value);
            if (!next) {
              return;
            }
            setPreference(next);
            applyThemeClass(next);
            startTransition(() => setThemePreference(next));
            close();
          }}
        />
      )}
    </Popover>
  );
};
