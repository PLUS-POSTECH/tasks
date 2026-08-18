"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { Popover } from "@/components/ui/popover";
import { PropertyButton, type PropertyButtonVariant } from "@/components/ui/property-button";
import { SelectMenu, type SelectMenuItem } from "@/components/ui/select-menu";
import { useWorkspaceData } from "@/components/workspace/workspace-data-provider";
import { classifyDueDate, formatShortDate } from "@/lib/formatting/dates";
import {
  addCalendarDays,
  calendarDateAtLocalMidnight,
  calendarDateIn,
  calendarDateWeekday,
} from "@/lib/formatting/calendar-date";
import { classNames } from "@/lib/utilities/class-names";

type DueDatePickerProps = {
  readonly value: string | null;
  readonly onSelect: (dueDate: string | null) => void;
  readonly variant?: PropertyButtonVariant;
  readonly disabled?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string;
};

const noDateValue = "__none__";
const customValue = "__custom__";

const dueDateToneClass = (dueDate: string, timeZone: string): string => {
  switch (classifyDueDate(dueDate, timeZone)) {
    case "overdue":
      return "text-danger";
    case "today":
      return "text-warning";
    case "soon":
      return "text-warning";
    case "later":
      return "";
  }
};

export const DueDatePicker = ({
  value,
  onSelect,
  variant = "chip",
  disabled = false,
  open,
  onOpenChange,
  className,
}: DueDatePickerProps) => {
  const { timeZone } = useWorkspaceData();
  const [customOpen, setCustomOpen] = useState(false);
  // "Today" is the workspace's day, the same one the tone above judges against
  // and the same one a reminder on the chosen date fires on.
  const today = calendarDateIn(new Date(), timeZone);
  const inDays = (days: number): string => addCalendarDays(today, days);
  const nextWeekday = (weekday: number): string =>
    addCalendarDays(today, (weekday - calendarDateWeekday(today) + 7) % 7 || 7);
  const candidateItems: readonly SelectMenuItem[] = [
    { value: noDateValue, label: "No due date", icon: <Icon name="calendar" size={14} className="text-foreground-quaternary" /> },
    { value: inDays(0), label: "Today", description: formatShortDate(calendarDateAtLocalMidnight(today)), icon: <Icon name="calendar" size={14} /> },
    { value: inDays(1), label: "Tomorrow", description: formatShortDate(calendarDateAtLocalMidnight(inDays(1))), icon: <Icon name="calendar" size={14} /> },
    { value: nextWeekday(5), label: "End of week", description: formatShortDate(calendarDateAtLocalMidnight(nextWeekday(5))), icon: <Icon name="calendar" size={14} /> },
    { value: nextWeekday(1), label: "Next week", description: formatShortDate(calendarDateAtLocalMidnight(nextWeekday(1))), icon: <Icon name="calendar" size={14} /> },
    { value: customValue, label: "Custom date…", icon: <Icon name="edit" size={14} /> },
  ];
  // "Tomorrow", "End of week", and "Next week" can fall on the same day; keep the first label for each date.
  const items = candidateItems.filter(
    (item, index) => candidateItems.findIndex((candidate) => candidate.value === item.value) === index,
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        onOpenChange?.(next);
        if (!next) {
          setCustomOpen(false);
        }
      }}
      disabled={disabled}
      trigger={
        <PropertyButton
          variant={variant}
          className={classNames(value ? dueDateToneClass(value, timeZone) : "", className)}
          muted={!value}
          aria-label={value ? `Due ${formatShortDate(calendarDateAtLocalMidnight(value))}` : "Set due date"}
          title={value ? `Due ${formatShortDate(calendarDateAtLocalMidnight(value))}` : "Set due date"}
          disabled={disabled}
          icon={<Icon name="calendar" size={14} />}
        >
          {value ? formatShortDate(calendarDateAtLocalMidnight(value)) : "Due date"}
        </PropertyButton>
      }
    >
      {(close) =>
        customOpen ? (
          <form
            className="flex flex-col gap-2 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const chosen = formData.get("date");
              if (typeof chosen === "string" && chosen) {
                onSelect(chosen);
                close();
              }
            }}
          >
            <label className="text-xs text-foreground-tertiary" htmlFor="due-date-input">
              Due date
            </label>
            <input
              id="due-date-input"
              name="date"
              type="date"
              defaultValue={value ?? undefined}
              autoFocus
              className="h-8 rounded-md border border-border bg-background px-2 text-[13px] text-foreground outline-none focus:border-accent"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCustomOpen(false)}
                className="h-7 rounded-md px-2 text-xs text-foreground-secondary hover:bg-background-tertiary"
              >
                Back
              </button>
              <button
                type="submit"
                className="h-7 rounded-md bg-accent px-2.5 text-xs font-medium text-accent-foreground hover:bg-accent-hover"
              >
                Set date
              </button>
            </div>
          </form>
        ) : (
          <SelectMenu
            items={items}
            searchable={false}
            selectedValues={value ? [value] : [noDateValue]}
            onSelect={(selected) => {
              if (selected === customValue) {
                setCustomOpen(true);
                return;
              }
              onSelect(selected === noDateValue ? null : selected);
              close();
            }}
          />
        )
      }
    </Popover>
  );
};
