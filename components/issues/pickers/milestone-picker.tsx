"use client";

import { Icon } from "@/components/ui/icon";
import type { PropertyButtonVariant } from "@/components/ui/property-button";
import type { SelectMenuItem } from "@/components/ui/select-menu";
import { calendarDateAtLocalMidnight } from "@/lib/formatting/calendar-date";
import { formatShortDate } from "@/lib/formatting/dates";
import type { MilestoneSummary } from "@/lib/issues/detail-queries";

import { PropertyPicker } from "./property-picker";

type MilestonePickerProps = {
  readonly value: MilestoneSummary | null;
  /** Milestones of the project the issue belongs to. */
  readonly milestones: readonly MilestoneSummary[];
  readonly onSelect: (milestoneIdentifier: string | null) => void;
  readonly variant?: PropertyButtonVariant;
};

const noMilestoneValue = "__none__";

export const MilestonePicker = ({
  value,
  milestones,
  onSelect,
  variant = "row",
}: MilestonePickerProps) => {
  const items: readonly SelectMenuItem[] = [
    { value: noMilestoneValue, label: "No milestone", icon: <Icon name="milestone" size={14} className="text-foreground-quaternary" /> },
    ...milestones.map((milestone) => ({
      value: milestone.identifier,
      label: milestone.name,
      description: milestone.targetDate ? formatShortDate(calendarDateAtLocalMidnight(milestone.targetDate)) : undefined,
      icon: <Icon name="milestone" size={14} />,
    })),
  ];

  return (
    <PropertyPicker
      items={items}
      selectedValue={value?.identifier ?? noMilestoneValue}
      onSelect={(selected) => onSelect(selected === noMilestoneValue ? null : selected)}
      icon={<Icon name="milestone" size={14} />}
      label={value?.name ?? "Milestone"}
      muted={!value}
      searchPlaceholder="Set milestone…"
      variant={variant}
    />
  );
};
