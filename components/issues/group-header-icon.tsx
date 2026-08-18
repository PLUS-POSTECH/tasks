"use client";

import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { UnassignedAvatar } from "@/components/ui/unassigned-avatar";
import { useWorkspaceData } from "@/components/workspace/workspace-data-provider";
import type { IssueGroupHeader } from "@/lib/issues/grouping";
import { startedStateProgress } from "@/lib/workflow/state-types";

import { PriorityIcon } from "./priority-icon";
import { StateIcon } from "./state-icon";

type GroupHeaderIconProps = {
  readonly header: IssueGroupHeader;
};

export const GroupHeaderIcon = ({ header }: GroupHeaderIconProps) => {
  const { states } = useWorkspaceData();
  switch (header.kind) {
    case "state": {
      return (
        <StateIcon
          type={header.state.type}
          color={header.state.color}
          progress={startedStateProgress(states, header.state.identifier)}
        />
      );
    }
    case "assignee":
      return header.assignee ? (
        <Avatar name={header.assignee.name} color={header.assignee.avatarColor} image={header.assignee.image} size={16} />
      ) : (
        <UnassignedAvatar size={16} />
      );
    case "priority":
      return <PriorityIcon priority={header.priority} />;
    case "project":
      return header.project ? (
        <span className="text-[13px] leading-none" style={{ color: header.project.color }}>
          {header.project.icon}
        </span>
      ) : (
        <Icon name="project" size={14} className="text-foreground-quaternary" />
      );
    case "label":
      return header.label ? (
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: header.label.color }}
        />
      ) : (
        <Icon name="tag" size={14} className="text-foreground-quaternary" />
      );
    case "none":
      return null;
  }
};
