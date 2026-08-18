"use client";

import { useMemo, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Popover } from "@/components/ui/popover";
import { PropertyButton, type PropertyButtonVariant } from "@/components/ui/property-button";
import { SelectMenu, type SelectMenuItem } from "@/components/ui/select-menu";
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

const useAssigneeItems = (): readonly SelectMenuItem[] => {
  const { members, currentUser } = useWorkspaceData();
  return useMemo((): readonly SelectMenuItem[] => {
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
};

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
  const items = useAssigneeItems();

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

type IssueAssigneePickerProps = {
  readonly value: readonly UserSummary[];
  readonly onChange: (userIdentifiers: readonly string[]) => void;
  readonly variant?: PropertyButtonVariant;
  readonly disabled?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string;
  readonly avatarSize?: number;
};

export const IssueAssigneePicker = ({
  value,
  onChange,
  variant = "icon",
  disabled = false,
  open,
  onOpenChange,
  className,
  avatarSize = 16,
}: IssueAssigneePickerProps) => {
  const items = useAssigneeItems();
  const [selected, setSelected] = useState<readonly string[]>(() =>
    value.map((assignee) => assignee.identifier),
  );
  const [lastValueKey, setLastValueKey] = useState(() =>
    value.map((assignee) => assignee.identifier).join(","),
  );
  const incomingKey = value.map((assignee) => assignee.identifier).join(",");
  if (incomingKey !== lastValueKey) {
    setLastValueKey(incomingKey);
    setSelected(value.map((assignee) => assignee.identifier));
  }

  const toggle = (userIdentifier: string) => {
    const next =
      userIdentifier === unassignedValue
        ? []
        : selected.includes(userIdentifier)
          ? selected.filter((identifier) => identifier !== userIdentifier)
          : [...selected, userIdentifier];
    setSelected(next);
    onChange(next);
  };
  const names = value.map((assignee) => assignee.name).join(", ");

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
          aria-label={value.length > 0 ? `Assignees: ${names}` : "Assign"}
          title={value.length > 0 ? names : "Assign"}
          disabled={disabled}
          icon={
            value.length === 0 ? (
              <UnassignedAvatar size={avatarSize} />
            ) : (
              <span className="flex items-center -space-x-1">
                {value.slice(0, 3).map((assignee) => (
                  <span key={assignee.identifier} className="rounded-full ring-2 ring-background">
                    <Avatar
                      name={assignee.name}
                      color={assignee.avatarColor}
                      image={assignee.image}
                      size={avatarSize}
                    />
                  </span>
                ))}
              </span>
            )
          }
        >
          {variant === "icon"
            ? null
            : value.length === 0
              ? "Assignees"
              : value.length === 1
                ? value[0]?.name
                : `${value.length} assignees`}
        </PropertyButton>
      }
    >
      <SelectMenu
        items={items}
        multiple
        selectedValues={selected.length === 0 ? [unassignedValue] : selected}
        searchPlaceholder="Assign to…"
        onSelect={toggle}
      />
    </Popover>
  );
};
