"use client";

import Link from "next/link";
import { useTransition, type ReactNode } from "react";

import { AssigneePicker } from "@/components/issues/pickers/assignee-picker";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Popover } from "@/components/ui/popover";
import { ProgressCircle } from "@/components/ui/progress-circle";
import { PropertyButton } from "@/components/ui/property-button";
import { SelectMenu } from "@/components/ui/select-menu";
import { useWorkspaceData } from "@/components/workspace/workspace-data-provider";
import { formatShortDate } from "@/lib/formatting/dates";
import { calendarDateAtLocalMidnight } from "@/lib/formatting/calendar-date";
import { toggleProjectMember, updateProject } from "@/lib/projects/actions";
import type { ProjectDetail } from "@/lib/projects/queries";

import { ProjectHealthBadge } from "./project-health-badge";
import { ProjectStatusPicker } from "./project-status-picker";

type ProjectPropertiesPanelProps = {
  readonly project: ProjectDetail;
  readonly access: ReactNode;
};

export const ProjectPropertiesPanel = ({ project, access }: ProjectPropertiesPanelProps) => {
  const { members } = useWorkspaceData();
  const [, startTransition] = useTransition();
  const progress = project.progress.total === 0 ? 0 : project.progress.completed / project.progress.total;

  const row = (label: string, control: ReactNode) => (
    <div className="flex min-h-7 items-center gap-2">
      <span className="w-[88px] shrink-0 text-xs text-foreground-tertiary">{label}</span>
      <div className="min-w-0 flex-1">{control}</div>
    </div>
  );

  const dateRow = (label: string, value: string | null, onChange: (value: string | null) => void) =>
    row(
      label,
      <label className="flex h-7 items-center gap-2 rounded-md px-1.5 text-[13px] text-foreground-secondary hover:bg-background-tertiary">
        <Icon name="calendar" size={14} className="text-foreground-tertiary" />
        <input
          type="date"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || null)}
          aria-label={label}
          className="bg-transparent text-[13px] outline-none"
        />
        {value ? <span className="sr-only">{formatShortDate(calendarDateAtLocalMidnight(value))}</span> : null}
      </label>,
    );

  return (
    <aside className="flex w-full flex-col gap-4 text-[13px] lg:w-[280px]">
      <section className="flex flex-col gap-1">
        <h2 className="mb-1 text-xs font-medium text-foreground-tertiary">Properties</h2>
        {row(
          "Status",
          <ProjectStatusPicker
            value={project.status}
            variant="row"
            onSelect={(status) => startTransition(() => updateProject(project.identifier, { status }))}
          />,
        )}
        {row("Health", <div className="px-1.5"><ProjectHealthBadge health={project.health} /></div>)}
        {row(
          "Lead",
          // The lead is access, so it follows the rule the server enforces:
          // admins and the current lead only.
          <AssigneePicker
            value={project.lead}
            variant="row"
            disabled={!project.canManageAccess}
            onSelect={(leadIdentifier) => startTransition(() => updateProject(project.identifier, { leadIdentifier }))}
          />,
        )}
        {row(
          "Members",
          <Popover
            disabled={!project.canManageAccess}
            trigger={
              <PropertyButton
                variant="row"
                muted={project.members.length === 0}
                icon={<Icon name="users" size={14} />}
                disabled={!project.canManageAccess}
                title={project.canManageAccess ? undefined : "Only admins and the project lead can change who is on a project."}
              >
                {project.members.length === 0 ? "Add members" : (
                  <span className="flex items-center -space-x-1">
                    {project.members.slice(0, 6).map((member) => (
                      <Avatar key={member.identifier} name={member.name} color={member.avatarColor} image={member.image} size={16} className="ring-2 ring-background" />
                    ))}
                    {project.members.length > 6 ? <span className="pl-2 text-xs">+{project.members.length - 6}</span> : null}
                  </span>
                )}
              </PropertyButton>
            }
          >
            <SelectMenu
              multiple
              items={members.map((member) => ({
                value: member.identifier,
                label: member.name,
                icon: <Avatar name={member.name} color={member.avatarColor} image={member.image} size={16} />,
              }))}
              selectedValues={project.members.map((member) => member.identifier)}
              searchPlaceholder="Add members…"
              onSelect={(userIdentifier) => startTransition(() => toggleProjectMember(project.identifier, userIdentifier))}
            />
          </Popover>,
        )}
        {row("Access", access)}
        {dateRow("Start date", project.startDate, (startDate) => startTransition(() => updateProject(project.identifier, { startDate })))}
        {dateRow("Target date", project.targetDate, (targetDate) => startTransition(() => updateProject(project.identifier, { targetDate })))}
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-3">
        <h2 className="text-xs font-medium text-foreground-tertiary">Progress</h2>
        <div className="flex items-center gap-3">
          <ProgressCircle progress={progress} size={36} strokeWidth={4} color={project.color} />
          <div className="flex flex-col text-xs text-foreground-secondary">
            <span className="text-sm font-medium text-foreground">{Math.round(progress * 100)}%</span>
            <span>
              {project.progress.completed} of {project.progress.total} issues done
            </span>
            {project.progress.started > 0 ? <span className="text-foreground-tertiary">{project.progress.started} in progress</span> : null}
          </div>
        </div>
        <Link href={`/project/${project.identifier}?tab=issues`} className="text-xs text-accent hover:underline">
          View all issues →
        </Link>
      </section>
    </aside>
  );
};
