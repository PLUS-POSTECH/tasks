"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { ProjectHealth } from "@/lib/database/schema/enum-values";
import { addProjectUpdate } from "@/lib/projects/actions";
import { projectHealthDefinitions } from "@/lib/projects/display";
import { classNames } from "@/lib/utilities/class-names";

type ProjectUpdateComposerProps = {
  readonly projectIdentifier: string;
  readonly health: ProjectHealth | null;
};

export const ProjectUpdateComposer = ({ projectIdentifier, health }: ProjectUpdateComposerProps) => {
  const [pending, startTransition] = useTransition();
  const [updateHealth, setUpdateHealth] = useState<ProjectHealth>(health ?? "on_track");
  const [updateBody, setUpdateBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const post = () => {
    if (updateBody.trim().length === 0) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await addProjectUpdate(projectIdentifier, updateHealth, updateBody);
        setUpdateBody("");
      } catch {
        setError("Could not post. Your text is still here — try again.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center gap-1">
        {projectHealthDefinitions.map((definition) => (
          <button
            key={definition.health}
            type="button"
            onClick={() => setUpdateHealth(definition.health)}
            className={classNames(
              "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs",
              updateHealth === definition.health
                ? "border-border-strong bg-background-tertiary text-foreground"
                : "border-transparent text-foreground-tertiary hover:bg-background-tertiary",
            )}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: definition.color }} />
            {definition.name}
          </button>
        ))}
      </div>
      <textarea
        value={updateBody}
        onChange={(event) => setUpdateBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            post();
          }
        }}
        rows={2}
        placeholder="What changed this week? Share progress, risks, and next steps…"
        aria-label="Project update"
        className="field-sizing-content w-full resize-none bg-transparent px-1 text-[13.5px] leading-6 text-foreground outline-none placeholder:text-foreground-quaternary"
      />
      <div className="flex items-center justify-end gap-2">
        {error ? <p className="mr-auto text-xs text-danger">{error}</p> : null}
        <Button variant="primary" size="small" disabled={pending || updateBody.trim().length === 0} onClick={post}>
          Post update
        </Button>
      </div>
    </div>
  );
};
