"use client";

import { PropertyPicker } from "@/components/issues/pickers/property-picker";
import type { PropertyButtonVariant } from "@/components/ui/property-button";
import type { ProjectStatus } from "@/lib/database/schema";
import { projectStatusDefinition, projectStatusDefinitions } from "@/lib/projects/display";

import { ProjectStatusIcon } from "./project-status-icon";

type ProjectStatusPickerProps = {
  readonly value: ProjectStatus;
  readonly onSelect: (status: ProjectStatus) => void;
  readonly variant?: PropertyButtonVariant;
};

export const ProjectStatusPicker = ({
  value,
  onSelect,
  variant = "chip",
}: ProjectStatusPickerProps) => (
  <PropertyPicker
    items={projectStatusDefinitions.map((definition, index) => ({
      value: definition.status,
      label: definition.name,
      icon: <ProjectStatusIcon status={definition.status} />,
      shortcut: String(index + 1),
    }))}
    selectedValue={value}
    onSelect={(selected) => {
      const definition = projectStatusDefinitions.find((candidate) => candidate.status === selected);
      if (definition) {
        onSelect(definition.status);
      }
    }}
    icon={<ProjectStatusIcon status={value} />}
    label={projectStatusDefinition(value).name}
    ariaLabel={`Status: ${projectStatusDefinition(value).name}`}
    searchPlaceholder="Change status…"
    variant={variant}
  />
);
