"use client";

import { useMemo, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { Popover } from "@/components/ui/popover";
import { SelectMenu, type SelectMenuItem } from "@/components/ui/select-menu";
import { UnassignedAvatar } from "@/components/ui/unassigned-avatar";
import { useWorkspaceData } from "@/components/workspace/workspace-data-provider";
import {
  filterMeToken,
  filterNoneToken,
  issueFilterCategories,
  type IssueFilterCategory,
} from "@/lib/issues/filters";
import { priorityDefinitions } from "@/lib/issues/priority";

import { PriorityIcon } from "./priority-icon";
import { StateIcon } from "./state-icon";
import { useIssueViewUrl } from "./use-issue-view-url";

type FilterMenuProps = {
  /** Categories the page's scope has already settled, which are left out of the menu. */
  readonly settled?: readonly IssueFilterCategory[];
};

export const FilterMenu = ({ settled = [] }: FilterMenuProps) => {
  const { states, members, labels, projects, currentUser } = useWorkspaceData();
  const { listOf, toggleInList } = useIssueViewUrl();
  const [category, setCategory] = useState<IssueFilterCategory | null>(null);
  const [open, setOpen] = useState(false);

  const categoryPresentation: Readonly<Record<IssueFilterCategory, { readonly icon: IconName; readonly shortcut?: string }>> = {
    state: { icon: "circle", shortcut: "s" },
    assignee: { icon: "user", shortcut: "a" },
    creator: { icon: "user-plus" },
    priority: { icon: "sliders", shortcut: "p" },
    label: { icon: "tag", shortcut: "l" },
    project: { icon: "project" },
  };

  const categoryItems: readonly SelectMenuItem[] = issueFilterCategories
    .filter((entry) => !settled.includes(entry.key))
    .map((entry) => ({
      value: entry.key,
      label: entry.menuLabel,
      icon: <Icon name={categoryPresentation[entry.key].icon} size={14} />,
      ...(categoryPresentation[entry.key].shortcut ? { shortcut: categoryPresentation[entry.key].shortcut } : {}),
    }));

  const menuLabelOf = (key: IssueFilterCategory): string =>
    issueFilterCategories.find((entry) => entry.key === key)?.menuLabel ?? key;

  const valueItems = useMemo((): readonly SelectMenuItem[] => {
    switch (category) {
      case "state":
        return states.map((state) => ({
          value: state.identifier,
          label: state.name,
          icon: <StateIcon type={state.type} color={state.color} />,
        }));
      case "assignee":
      case "creator":
        return [
          ...(category === "assignee"
            ? [{ value: filterNoneToken, label: "No assignee", icon: <UnassignedAvatar size={16} /> }]
            : []),
          { value: filterMeToken, label: `${currentUser.name} (you)`, icon: <Avatar name={currentUser.name} color={currentUser.avatarColor} image={currentUser.image} size={16} /> },
          ...members
            .filter((member) => member.identifier !== currentUser.identifier)
            .map((member) => ({
              value: member.identifier,
              label: member.name,
              icon: <Avatar name={member.name} color={member.avatarColor} image={member.image} size={16} />,
            })),
        ];
      case "priority":
        return priorityDefinitions.map((definition) => ({
          value: String(definition.value),
          label: definition.name,
          icon: <PriorityIcon priority={definition.value} />,
        }));
      case "label":
        return labels.map((label) => ({
            value: label.identifier,
            label: label.name,
            icon: <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} />,
          }));
      case "project":
        return [
          { value: filterNoneToken, label: "No project", icon: <Icon name="project" size={14} /> },
          ...projects.map((project) => ({
            value: project.identifier,
            label: project.name,
            icon: <span style={{ color: project.color }}>{project.icon}</span>,
          })),
        ];
      case null:
        return [];
    }
  }, [category, states, members, labels, projects, currentUser]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setCategory(null);
        }
      }}
      trigger={
        <Button variant="ghost" size="small" leadingIcon={<Icon name="filter" size={13} />}>
          Filter
        </Button>
      }
    >
      {category === null ? (
        <SelectMenu
          items={categoryItems}
          searchPlaceholder="Filter by…"
          onSelect={(value) => setCategory(value as IssueFilterCategory)}
        />
      ) : (
        <SelectMenu
          items={valueItems}
          multiple
          selectedValues={listOf(category)}
          searchPlaceholder={`${menuLabelOf(category)}…`}
          onSelect={(value) => toggleInList(category, value)}
          header={
            <button
              type="button"
              onClick={() => setCategory(null)}
              className="flex h-8 items-center gap-1.5 border-b border-border px-3 text-xs text-foreground-tertiary hover:text-foreground"
            >
              <Icon name="chevron-left" size={12} /> {menuLabelOf(category)}
            </button>
          }
        />
      )}
    </Popover>
  );
};
