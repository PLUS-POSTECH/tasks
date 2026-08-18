"use client";

import { useTransition } from "react";

import { AssigneePicker } from "@/components/issues/pickers/assignee-picker";
import type { ProjectStatus } from "@/lib/database/schema/enum-values";
import type { UserSummary } from "@/lib/users/types";
import { updateProject } from "@/lib/projects/actions";

import { ProjectStatusPicker } from "./project-status-picker";

type ProjectStatusControlProps = {
  readonly projectIdentifier: string;
  readonly status: ProjectStatus;
};

export const ProjectStatusControl = ({ projectIdentifier, status }: ProjectStatusControlProps) => {
  const [, startTransition] = useTransition();
  return (
    <ProjectStatusPicker value={status} onSelect={(next) => startTransition(() => updateProject(projectIdentifier, { status: next }))} />
  );
};

type ProjectLeadControlProps = {
  readonly projectIdentifier: string;
  readonly lead: UserSummary | null;
  /** The lead decides who reaches the project, so only admins and the lead set it. */
  readonly canManage: boolean;
};

export const ProjectLeadControl = ({ projectIdentifier, lead, canManage }: ProjectLeadControlProps) => {
  const [, startTransition] = useTransition();
  return (
    <AssigneePicker
      value={lead}
      avatarSize={18}
      disabled={!canManage}
      onSelect={(leadIdentifier) => startTransition(() => updateProject(projectIdentifier, { leadIdentifier }))}
    />
  );
};
