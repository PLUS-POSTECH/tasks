"use client";

import { useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import { deleteProjectUpdate } from "@/lib/projects/actions";

type DeleteProjectUpdateButtonProps = {
  readonly updateIdentifier: string;
  /** The health the project shows once this update is gone; the badge is written from the newest update. */
  readonly healthAfterDeleting: string | null;
};

export const DeleteProjectUpdateButton = ({ updateIdentifier, healthAfterDeleting }: DeleteProjectUpdateButtonProps) => {
  const [, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => {
        const outcome =
          healthAfterDeleting === null
            ? "The project is left with no health."
            : `The project's health then reads ${healthAfterDeleting}.`;
        if (window.confirm(`Delete this update? ${outcome} This cannot be undone.`)) {
          startTransition(() => deleteProjectUpdate(updateIdentifier));
        }
      }}
      aria-label="Delete update"
      className="rounded p-0.5 text-foreground-quaternary hover:text-danger md:opacity-0 md:group-hover/update:opacity-100"
    >
      <Icon name="trash" size={12} />
    </button>
  );
};
