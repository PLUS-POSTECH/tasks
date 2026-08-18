"use client";

import { Icon } from "@/components/ui/icon";
import type { PropertyButtonVariant } from "@/components/ui/property-button";
import type { SelectMenuItem } from "@/components/ui/select-menu";

import { PropertyPicker } from "./property-picker";

type EstimatePickerProps = {
  readonly value: number | null;
  readonly onSelect: (estimate: number | null) => void;
  readonly variant?: PropertyButtonVariant;
  readonly disabled?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string;
};

const noEstimateValue = "__none__";

const estimateScale = [1, 2, 3, 5, 8, 13, 21] as const;

export const EstimatePicker = ({
  value,
  onSelect,
  variant = "chip",
  disabled = false,
  open,
  onOpenChange,
  className,
}: EstimatePickerProps) => {
  const items: readonly SelectMenuItem[] = [
    {
      value: noEstimateValue,
      label: "No estimate",
      icon: <Icon name="estimate" size={14} className="text-foreground-quaternary" />,
      shortcut: "0",
    },
    ...estimateScale.map((points, index) => ({
      value: String(points),
      label: `${points} ${points === 1 ? "point" : "points"}`,
      icon: <Icon name="estimate" size={14} />,
      shortcut: index < 9 ? String(index + 1) : undefined,
    })),
  ];

  return (
    <PropertyPicker
      items={items}
      selectedValue={value === null ? noEstimateValue : String(value)}
      onSelect={(selected) => onSelect(selected === noEstimateValue ? null : Number(selected))}
      icon={<Icon name="estimate" size={14} />}
      label={value === null ? "Estimate" : `${value}`}
      ariaLabel={value === null ? "Set estimate" : `Estimate: ${value}`}
      title={value === null ? "Set estimate" : `${value} points`}
      muted={value === null}
      searchable={false}
      variant={variant}
      disabled={disabled}
      open={open}
      onOpenChange={onOpenChange}
      className={className}
    />
  );
};
