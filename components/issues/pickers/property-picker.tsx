"use client";

import type { ReactNode } from "react";

import { Popover } from "@/components/ui/popover";
import { PropertyButton, type PropertyButtonVariant } from "@/components/ui/property-button";
import { SelectMenu, type SelectMenuItem } from "@/components/ui/select-menu";

type PropertyPickerProps = {
  readonly items: readonly SelectMenuItem[];
  readonly selectedValue: string | null;
  readonly onSelect: (value: string) => void;
  readonly icon: ReactNode;
  readonly label: ReactNode;
  readonly ariaLabel?: string;
  readonly title?: string;
  readonly muted?: boolean;
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
  readonly variant?: PropertyButtonVariant;
  readonly disabled?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string;
};

export const PropertyPicker = ({
  items,
  selectedValue,
  onSelect,
  icon,
  label,
  ariaLabel,
  title,
  muted,
  searchable,
  searchPlaceholder,
  variant,
  disabled,
  open,
  onOpenChange,
  className,
}: PropertyPickerProps) => (
  <Popover
    open={open}
    onOpenChange={onOpenChange}
    disabled={disabled}
    trigger={
      <PropertyButton
        variant={variant}
        className={className}
        muted={muted}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        icon={icon}
      >
        {label}
      </PropertyButton>
    }
  >
    {(close) => (
      <SelectMenu
        items={items}
        selectedValues={selectedValue === null ? [] : [selectedValue]}
        searchable={searchable}
        searchPlaceholder={searchPlaceholder}
        onSelect={(value) => {
          onSelect(value);
          close();
        }}
      />
    )}
  </Popover>
);
