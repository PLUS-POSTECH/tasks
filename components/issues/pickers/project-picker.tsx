"use client";

import { Icon } from "@/components/ui/icon";
import type { PropertyButtonVariant } from "@/components/ui/property-button";
import type { SelectMenuItem } from "@/components/ui/select-menu";
import { useWorkspaceData } from "@/components/workspace/workspace-data-provider";
import type { ProjectSummary } from "@/lib/projects/types";

import { PropertyPicker } from "./property-picker";

type ProjectPickerProps = {
  readonly value: ProjectSummary | null;
  readonly onSelect: (projectIdentifier: string | null) => void;
  readonly variant?: PropertyButtonVariant;
  readonly disabled?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly className?: string;
};

const noProjectValue = "__none__";

export const ProjectPicker = ({
  value,
  onSelect,
  variant = "chip",
  disabled = false,
  open,
  onOpenChange,
  className,
}: ProjectPickerProps) => {
  const { projects } = useWorkspaceData();
  const items: readonly SelectMenuItem[] = [
    {
      value: noProjectValue,
      label: "No project",
      icon: <Icon name="project" size={14} className="text-foreground-quaternary" />,
    },
    ...projects
      .filter((project) => project.status !== "canceled" && project.status !== "completed")
      .map((project) => ({
        value: project.identifier,
        label: project.name,
        icon: (
          <span className="text-[13px] leading-none" style={{ color: project.color }}>
            {project.icon}
          </span>
        ),
        keywords: [project.status],
      })),
  ];

  return (
    <PropertyPicker
      items={items}
      selectedValue={value?.identifier ?? noProjectValue}
      onSelect={(selected) => onSelect(selected === noProjectValue ? null : selected)}
      icon={
        value ? (
          <span className="text-[13px] leading-none" style={{ color: value.color }}>
            {value.icon}
          </span>
        ) : (
          <Icon name="project" size={14} />
        )
      }
      label={value?.name ?? "Project"}
      ariaLabel={value ? `Project: ${value.name}` : "Add to project"}
      title={value ? value.name : "Add to project"}
      muted={!value}
      searchPlaceholder="Add to project…"
      variant={variant}
      disabled={disabled}
      open={open}
      onOpenChange={onOpenChange}
      className={className}
    />
  );
};
