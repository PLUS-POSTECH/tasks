"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { Popover } from "@/components/ui/popover";
import { PropertyButton, type PropertyButtonVariant } from "@/components/ui/property-button";
import { SelectMenu, type SelectMenuItem } from "@/components/ui/select-menu";
import { useWorkspaceData } from "@/components/workspace/workspace-data-provider";
import type { LabelSummary } from "@/lib/labels/types";

type LabelPickerProps = {
  readonly value: readonly LabelSummary[];
  readonly onChange: (labelIdentifiers: readonly string[]) => void;
  readonly onCreate?: (name: string) => Promise<string | null>;
  readonly variant?: PropertyButtonVariant;
  readonly disabled?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string;
};

export const LabelPicker = ({
  value,
  onChange,
  onCreate,
  variant = "chip",
  disabled = false,
  open,
  onOpenChange,
  className,
}: LabelPickerProps) => {
  const { labels } = useWorkspaceData();
  const [selected, setSelected] = useState<readonly string[]>(() =>
    value.map((label) => label.identifier),
  );
  const [lastValueKey, setLastValueKey] = useState(() =>
    value.map((label) => label.identifier).join(","),
  );
  const incomingKey = value.map((label) => label.identifier).join(",");
  if (incomingKey !== lastValueKey) {
    setLastValueKey(incomingKey);
    setSelected(value.map((label) => label.identifier));
  }

  const items: readonly SelectMenuItem[] = labels.map((label) => ({
    value: label.identifier,
    label: label.name,
    icon: (
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: label.color }}
      />
    ),
  }));

  const toggle = (labelIdentifier: string) => {
    const next = selected.includes(labelIdentifier)
      ? selected.filter((identifier) => identifier !== labelIdentifier)
      : [...selected, labelIdentifier];
    setSelected(next);
    onChange(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      disabled={disabled}
      trigger={
        <PropertyButton
          variant={variant}
          className={className}
          muted={value.length === 0}
          aria-label="Labels"
          title="Labels"
          disabled={disabled}
          icon={
            value.length === 0 ? (
              <Icon name="tag" size={14} />
            ) : (
              <span className="flex items-center -space-x-1">
                {value.slice(0, 3).map((label) => (
                  <span
                    key={label.identifier}
                    className="h-2.5 w-2.5 rounded-full ring-2 ring-background"
                    style={{ backgroundColor: label.color }}
                  />
                ))}
              </span>
            )
          }
        >
          {value.length === 0
            ? "Labels"
            : value.length === 1
              ? value[0]?.name
              : `${value.length} labels`}
        </PropertyButton>
      }
    >
      <SelectMenu
        items={items}
        multiple
        selectedValues={selected}
        searchPlaceholder="Add labels…"
        onSelect={toggle}
        onCreate={
          onCreate
            ? async (name) => {
                const created = await onCreate(name);
                if (created) {
                  toggle(created);
                }
              }
            : undefined
        }
      />
    </Popover>
  );
};
