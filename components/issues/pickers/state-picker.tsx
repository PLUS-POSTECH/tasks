"use client";

import { useMemo } from "react";

import { StateIcon } from "@/components/issues/state-icon";
import type { PropertyButtonVariant } from "@/components/ui/property-button";
import type { SelectMenuItem } from "@/components/ui/select-menu";
import { useWorkspaceData } from "@/components/workspace/workspace-data-provider";
import type { IssueStateSummary } from "@/lib/workflow/types";
import {
  startedStateProgress,
  compareWorkflowStatesForDisplay,
} from "@/lib/workflow/state-types";

import { PropertyPicker } from "./property-picker";

type StatePickerProps = {
  readonly value: IssueStateSummary | null;
  readonly onSelect: (stateIdentifier: string) => void;
  readonly variant?: PropertyButtonVariant;
  readonly disabled?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string;
};

export const StatePicker = ({
  value,
  onSelect,
  variant = "icon",
  disabled = false,
  open,
  onOpenChange,
  className,
}: StatePickerProps) => {
  const { states: workspaceStates } = useWorkspaceData();
  const states = useMemo(() => [...workspaceStates].sort(compareWorkflowStatesForDisplay), [workspaceStates]);

  const items: readonly SelectMenuItem[] = states.map((state, index) => ({
    value: state.identifier,
    label: state.name,
    icon: (
      <StateIcon
        type={state.type}
        color={state.color}
        progress={startedStateProgress(states, state.identifier)}
      />
    ),
    shortcut: index < 9 ? String(index + 1) : undefined,
    keywords: [state.type],
  }));

  return (
    <PropertyPicker
      items={items}
      selectedValue={value?.identifier ?? null}
      onSelect={onSelect}
      icon={
        value ? (
          <StateIcon
            type={value.type}
            color={value.color}
            progress={startedStateProgress(states, value.identifier)}
          />
        ) : (
          <StateIcon type="backlog" color="var(--foreground-quaternary)" />
        )
      }
      label={variant !== "icon" ? (value?.name ?? "Status") : null}
      ariaLabel={value ? `Status: ${value.name}` : "Set status"}
      title={value ? value.name : "Set status"}
      searchPlaceholder="Change status…"
      variant={variant}
      disabled={disabled}
      open={open}
      onOpenChange={onOpenChange}
      className={className}
    />
  );
};
