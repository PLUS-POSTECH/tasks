"use client";

import { useMemo } from "react";

import { Avatar } from "@/components/ui/avatar";
import type { PropertyButtonVariant } from "@/components/ui/property-button";
import type { SelectMenuItem } from "@/components/ui/select-menu";
import { UnassignedAvatar } from "@/components/ui/unassigned-avatar";
import { useWorkspaceData } from "@/components/workspace/workspace-data-provider";
import type { UserSummary } from "@/lib/users/types";

import { PropertyPicker } from "./property-picker";

type AssigneePickerProps = {
  readonly value: UserSummary | null;
  readonly onSelect: (userIdentifier: string | null) => void;
  readonly variant?: PropertyButtonVariant;
  readonly disabled?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string;
  readonly avatarSize?: number;
};

const unassignedValue = "__unassigned__";

export const AssigneePicker = ({
  value,
  onSelect,
  variant = "icon",
  disabled = false,
  open,
  onOpenChange,
  className,
  avatarSize = 16,
}: AssigneePickerProps) => {
  const { members, currentUser } = useWorkspaceData();

  const items = useMemo((): readonly SelectMenuItem[] => {
    const ordered = [...members].sort((left, right) =>
      left.identifier === currentUser.identifier
        ? -1
        : right.identifier === currentUser.identifier
          ? 1
          : left.name.localeCompare(right.name),
    );
    return [
      {
        value: unassignedValue,
        label: "No assignee",
        icon: <UnassignedAvatar size={16} />,
        shortcut: "0",
      },
      ...ordered.map((member) => ({
        value: member.identifier,
        label:
          member.identifier === currentUser.identifier
            ? `${member.name} (you)`
            : member.name,
        description: member.displayName,
        keywords: [member.displayName],
        icon: <Avatar name={member.name} color={member.avatarColor} image={member.image} size={16} />,
      })),
    ];
  }, [members, currentUser.identifier]);

  return (
    <PropertyPicker
      items={items}
      selectedValue={value?.identifier ?? unassignedValue}
      onSelect={(selected) => onSelect(selected === unassignedValue ? null : selected)}
      icon={
        value ? (
          <Avatar name={value.name} color={value.avatarColor} image={value.image} size={avatarSize} />
        ) : (
          <UnassignedAvatar size={avatarSize} />
        )
      }
      label={variant !== "icon" ? (value?.name ?? "Assignee") : null}
      ariaLabel={value ? `Assignee: ${value.name}` : "Assign"}
      title={value ? value.name : "Assign"}
      muted={!value}
      searchPlaceholder="Assign to…"
      variant={variant}
      disabled={disabled}
      open={open}
      onOpenChange={onOpenChange}
      className={className}
    />
  );
};
