import { Markdown } from "@/components/markdown/markdown";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Timestamp } from "@/components/ui/timestamp";
import type { ProjectHealth } from "@/lib/database/schema/enum-values";
import { projectHealthDefinition } from "@/lib/projects/display";
import type { ProjectUpdate } from "@/lib/projects/queries";
import { getCurrentUser } from "@/lib/session/current-user";

import { DeleteProjectUpdateButton } from "./delete-project-update-button";
import { ProjectUpdateComposer } from "./project-update-composer";

type ProjectUpdatesProps = {
  readonly projectIdentifier: string;
  readonly health: ProjectHealth | null;
  readonly updates: readonly ProjectUpdate[];
};

/**
 * Only the author or an admin is offered the button that removes an update —
 * the same predicate `deleteProjectUpdate` applies.
 */
export const ProjectUpdates = async ({ projectIdentifier, health, updates }: ProjectUpdatesProps) => {
  const currentUser = await getCurrentUser();
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon name="activity" size={14} className="text-foreground-tertiary" />
        <h2 className="text-[13px] font-medium text-foreground">Project updates</h2>
      </div>
      <ProjectUpdateComposer projectIdentifier={projectIdentifier} health={health} />
      <ol className="flex flex-col gap-3">
        {updates.map((update) => {
          const definition = projectHealthDefinition(update.health);
          // Newest first, so the first that is not this one is what the badge
          // falls back to.
          const surviving = updates.find((candidate) => candidate.identifier !== update.identifier);
          return (
            <li key={update.identifier} className="group/update flex gap-3">
              {update.author ? <Avatar name={update.author.name} color={update.author.avatarColor} image={update.author.image} size={24} className="mt-1" /> : null}
              <div className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-foreground">{update.author?.name ?? "Former member"}</span>
                  <span className="inline-flex items-center gap-1 text-foreground-secondary">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: definition.color }} />
                    {definition.name}
                  </span>
                  <Timestamp value={update.createdAt} format="relative" className="text-foreground-quaternary" />
                  <span className="flex-1" />
                  {update.author?.identifier === currentUser.identifier || currentUser.isAdmin ? (
                    <DeleteProjectUpdateButton
                      updateIdentifier={update.identifier}
                      healthAfterDeleting={surviving ? projectHealthDefinition(surviving.health).name : null}
                    />
                  ) : null}
                </div>
                <Markdown source={update.body} className="mt-1" />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
