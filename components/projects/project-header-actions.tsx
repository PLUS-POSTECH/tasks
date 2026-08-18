"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Popover } from "@/components/ui/popover";
import { SelectMenu } from "@/components/ui/select-menu";
import { useToast } from "@/components/ui/toast-provider";
import { deleteProject } from "@/lib/projects/actions";

type ProjectHeaderActionsProps = {
  readonly projectIdentifier: string;
  readonly projectName: string;
  /** Deleting a project is deciding who keeps its issues, so admins and the lead only. */
  readonly canDelete: boolean;
};

export const ProjectHeaderActions = ({ projectIdentifier, projectName, canDelete }: ProjectHeaderActionsProps) => {
  const router = useRouter();
  const { showToast } = useToast();
  const [, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-0.5">
      <Popover
        align="end"
        trigger={
          <IconButton size="rail" tone="muted" aria-label="More actions">
            <Icon name="more" size={15} />
          </IconButton>
        }
      >
        {(close) => (
          <SelectMenu
            searchable={false}
            items={[
              { value: "copy", label: "Copy link", icon: <Icon name="link" size={14} /> },
              ...(canDelete
                ? [{ value: "delete", label: "Delete project…", icon: <Icon name="trash" size={14} className="text-danger" /> }]
                : []),
            ]}
            onSelect={(value) => {
              close();
              if (value === "copy") {
                void navigator.clipboard.writeText(window.location.href);
                showToast({ title: "Link copied" });
              }
              if (value === "delete" && window.confirm(`Delete project "${projectName}"? Only a project with no issues can be deleted.`)) {
                startTransition(async () => {
                  try {
                    await deleteProject(projectIdentifier);
                    router.push("/projects");
                  } catch (error) {
                    showToast({
                      title: "Could not delete the project",
                      description: error instanceof Error ? error.message : undefined,
                      tone: "danger",
                    });
                  }
                });
              }
            }}
          />
        )}
      </Popover>
    </div>
  );
};
