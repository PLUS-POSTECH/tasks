"use client";

import { PriorityIcon } from "@/components/issues/priority-icon";
import type { PropertyButtonVariant } from "@/components/ui/property-button";
import type { SelectMenuItem } from "@/components/ui/select-menu";
import type { Priority } from "@/lib/database/schema";
import { isPriority, priorityDefinitions, priorityName } from "@/lib/issues/priority";

import { PropertyPicker } from "./property-picker";

type PriorityPickerProps = {
  readonly value: number;
  readonly onSelect: (priority: Priority) => void;
  readonly variant?: PropertyButtonVariant;
  readonly disabled?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string;
};

const items: readonly SelectMenuItem[] = priorityDefinitions.map(
  (definition) => ({
    value: String(definition.value),
    label: definition.name,
    icon: <PriorityIcon priority={definition.value} />,
    shortcut: definition.shortcut,
  }),
);

export const PriorityPicker = ({
  value,
  onSelect,
  variant = "icon",
  disabled = false,
  open,
  onOpenChange,
  className,
}: PriorityPickerProps) => (
  <PropertyPicker
    items={items}
    selectedValue={String(value)}
    onSelect={(selected) => {
      const priority = Number(selected);
      if (isPriority(priority)) {
        onSelect(priority);
      }
    }}
    icon={<PriorityIcon priority={value} />}
    label={variant !== "icon" ? priorityName(value) : null}
    ariaLabel={`Priority: ${priorityName(value)}`}
    title={priorityName(value)}
    muted={value === 0}
    searchPlaceholder="Set priority…"
    variant={variant}
    disabled={disabled}
    open={open}
    onOpenChange={onOpenChange}
    className={className}
  />
);
