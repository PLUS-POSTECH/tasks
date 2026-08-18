"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { ColorSwatches } from "@/components/ui/color-swatches";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { TextInput } from "@/components/ui/text-input";
import { createLabel, deleteLabel, updateLabel } from "@/lib/labels/actions";
import type { LabelWithIssueCount } from "@/lib/labels/types";

import { AdminOnlyNotice } from "./admin-only-notice";
import { SettingsSection } from "./settings-section";

type LabelsManagerProps = {
  readonly labels: readonly LabelWithIssueCount[];
  /** False for members, who may add and rename labels but not delete one. */
  readonly canManage: boolean;
};

const colorChoices = ["#eb5757", "#f2994a", "#f2c94c", "#27ae60", "#26b5ce", "#4ea7fc", "#5e6ad2", "#bb87fc", "#8a8f98", "#95a2b3"] as const;

/** Must match the bound `lib/labels/actions.ts` accepts. */
const maximumLabelNameLength = 60;

const labelNameProblem = (name: string): string | null => {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return "Enter a label name.";
  }
  if (trimmed.length > maximumLabelNameLength) {
    return `A label name is at most ${maximumLabelNameLength} characters.`;
  }
  return null;
};

export const LabelsManager = ({ labels, canManage }: LabelsManagerProps) => {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(colorChoices[6]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <SettingsSection title="Labels" description="Available on every issue.">
      <form
        className="flex flex-wrap items-center gap-2 border-b border-border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const problem = labelNameProblem(name);
          if (problem) {
            setCreateError(problem);
            return;
          }
          setCreateError(null);
          startTransition(async () => {
            try {
              await createLabel({ name, color });
              setName("");
            } catch {
              setCreateError("Could not create the label. Try again.");
            }
          });
        }}
      >
        <div className="flex items-center gap-1">
          <ColorSwatches
            choices={colorChoices}
            value={color}
            onSelect={setColor}
            size={16}
            ariaLabelPrefix="Color"
          />
        </div>
        <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="New label name" aria-label="Label name" className="w-[220px]" />
        <Button variant="primary" type="submit" disabled={pending || name.trim().length === 0}>
          Create label
        </Button>
        {createError ? <span className="text-xs text-danger">{createError}</span> : null}
      </form>
      {labels.length === 0 ? <p className="px-4 py-3 text-xs text-foreground-quaternary">No labels yet.</p> : null}
      {labels.map((label) => (
        <div key={label.identifier} className="group/label flex items-center gap-3 border-b border-border px-4 py-2 last:border-b-0">
          <div className="flex items-center gap-1">
            <ColorSwatches
              choices={colorChoices}
              value={label.color}
              onSelect={(choice) => startTransition(() => updateLabel(label.identifier, { color: choice }))}
              size={12}
              ariaLabelPrefix="Set color"
              className="transition-opacity md:opacity-0 md:group-hover/label:opacity-100"
            />
          </div>
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
          {editing === label.identifier ? (
            <form
              className="flex flex-1 items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const problem = labelNameProblem(editName);
                if (problem) {
                  setRenameError(problem);
                  return;
                }
                setRenameError(null);
                startTransition(async () => {
                  try {
                    await updateLabel(label.identifier, { name: editName });
                    setEditing(null);
                  } catch {
                    setRenameError("Could not rename the label. Try again.");
                  }
                });
              }}
            >
              <TextInput value={editName} onChange={(event) => setEditName(event.target.value)} autoFocus aria-label="Label name" className="w-[220px]" />
              <Button variant="primary" size="small" type="submit">Save</Button>
              <Button variant="ghost" size="small" onClick={() => setEditing(null)}>Cancel</Button>
              {renameError ? <span className="text-xs text-danger">{renameError}</span> : null}
            </form>
          ) : (
            <span className="flex-1 text-[13px] text-foreground">{label.name}</span>
          )}
          <IconButton
            size="inline"
            tone="subtle"
            revealOnGroupHover="md:group-hover/label:opacity-100"
            onClick={() => {
              setEditName(label.name);
              setRenameError(null);
              setEditing(label.identifier);
            }}
            aria-label={`Rename ${label.name}`}
          >
            <Icon name="edit" size={13} />
          </IconButton>
          {canManage ? (
            <IconButton
              size="inline"
              tone="subtle-danger"
              revealOnGroupHover="md:group-hover/label:opacity-100"
              onClick={() => {
                // `issue_labels` cascades, so this is how many issues across the
                // whole workspace lose the label — not how many are on screen.
                const carrying =
                  label.issueCount === 0
                    ? "No issues carry it."
                    : `${label.issueCount} issue${label.issueCount === 1 ? "" : "s"} will lose it.`;
                if (window.confirm(`Delete label "${label.name}"? ${carrying} This cannot be undone.`)) {
                  startTransition(() => deleteLabel(label.identifier));
                }
              }}
              aria-label={`Delete ${label.name}`}
            >
              <Icon name="trash" size={13} />
            </IconButton>
          ) : null}
        </div>
      ))}
      {canManage ? null : <AdminOnlyNotice change="delete a label" />}
    </SettingsSection>
  );
};
