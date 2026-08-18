"use client";

import { useState, useTransition } from "react";

import { StateIcon } from "@/components/issues/state-icon";
import { Button } from "@/components/ui/button";
import { ColorSwatches } from "@/components/ui/color-swatches";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { TextInput } from "@/components/ui/text-input";
import type { WorkflowStateType } from "@/lib/database/schema";
import type { IssueStateSummary, WorkflowStateWithIssueCount } from "@/lib/workflow/types";
import {
  createWorkflowState,
  deleteWorkflowState,
  reorderWorkflowState,
  updateWorkflowState,
} from "@/lib/workflow/actions";
import { compareWorkflowStatesForDisplay, workflowStateTypeDefinitions } from "@/lib/workflow/state-types";

import { AdminOnlyNotice } from "./admin-only-notice";
import { SettingsSection } from "./settings-section";

type WorkflowStatesManagerProps = {
  readonly states: readonly WorkflowStateWithIssueCount[];
  /** False for members, who may edit statuses but not delete one. */
  readonly canManage: boolean;
};

const colorChoices = ["#8a8f98", "#e2e2e2", "#f2c94c", "#26b5ce", "#5e6ad2", "#27ae60", "#f2994a", "#eb5757", "#95a2b3", "#bb87fc"] as const;

/** Must match the bound `lib/workflow/actions.ts` accepts. */
const maximumStatusNameLength = 60;

const statusNameProblem = (name: string): string | null => {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return "Enter a status name.";
  }
  if (trimmed.length > maximumStatusNameLength) {
    return `A status name is at most ${maximumStatusNameLength} characters.`;
  }
  return null;
};

const typeDescriptions: Readonly<Record<WorkflowStateType, string>> = {
  backlog: "Not planned yet",
  unstarted: "Planned, not started",
  started: "Work in progress",
  completed: "Finished work",
  canceled: "Will not be done",
};

export const WorkflowStatesManager = ({ states, canManage }: WorkflowStatesManagerProps) => {
  const [pending, startTransition] = useTransition();
  const [addingType, setAddingType] = useState<WorkflowStateType | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(colorChoices[0]);
  const [addError, setAddError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [replacement, setReplacement] = useState<string>("");

  const ordered = [...states].sort(compareWorkflowStatesForDisplay);

  const move = (state: IssueStateSummary, direction: -1 | 1) => {
    const sameType = ordered.filter((candidate) => candidate.type === state.type);
    const index = sameType.findIndex((candidate) => candidate.identifier === state.identifier);
    const neighbor = sameType[index + direction];
    if (!neighbor) {
      return;
    }
    const beyond = sameType[index + direction * 2];
    const position = beyond ? (neighbor.position + beyond.position) / 2 : neighbor.position + direction * 0.5;
    startTransition(() => reorderWorkflowState(state.identifier, position));
  };

  return (
    <SettingsSection title="Workflow" description="Statuses issues move through, grouped by category. Order within a category is what users see.">
      {workflowStateTypeDefinitions.map((definition) => {
          const group = ordered.filter((state) => state.type === definition.type);
          const deletingState = group.find((state) => state.identifier === deleting);
          return (
            <div key={definition.type} className="border-b border-border last:border-b-0">
              <div className="flex items-center gap-2 bg-background-secondary px-4 py-1.5">
                <span className="text-xs font-medium text-foreground">{definition.name}</span>
                <span className="text-2xs text-foreground-quaternary">{typeDescriptions[definition.type]}</span>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => {
                    setAddingType(definition.type);
                    setNewName("");
                    setAddError(null);
                  }}
                  aria-label={`Add ${definition.name} status`}
                  className="flex h-5 w-5 items-center justify-center rounded text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground"
                >
                  <Icon name="plus" size={12} />
                </button>
              </div>
              {group.map((state, index) => (
                <div key={state.identifier} className="group/state flex items-center gap-3 px-4 py-2">
                  <StateIcon type={state.type} color={state.color} />
                  {editing === state.identifier ? (
                    <form
                      className="flex flex-1 items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const problem = statusNameProblem(editName);
                        if (problem) {
                          setRenameError(problem);
                          return;
                        }
                        setRenameError(null);
                        startTransition(async () => {
                          try {
                            await updateWorkflowState(state.identifier, { name: editName });
                            setEditing(null);
                          } catch {
                            setRenameError("Could not rename the status. Try again.");
                          }
                        });
                      }}
                    >
                      <TextInput value={editName} onChange={(event) => setEditName(event.target.value)} autoFocus aria-label="Status name" className="w-[220px]" />
                      <Button variant="primary" size="small" type="submit">Save</Button>
                      <Button variant="ghost" size="small" onClick={() => setEditing(null)}>Cancel</Button>
                      {renameError ? <span className="text-xs text-danger">{renameError}</span> : null}
                    </form>
                  ) : (
                    <span className="flex-1 text-[13px] text-foreground">{state.name}</span>
                  )}
                  <div className="flex items-center gap-1 md:opacity-0 md:group-hover/state:opacity-100">
                    <ColorSwatches
                      choices={colorChoices}
                      value={state.color}
                      onSelect={(choice) => startTransition(() => updateWorkflowState(state.identifier, { color: choice }))}
                      size={12}
                      ariaLabelPrefix="Set color"
                    />
                  </div>
                  <IconButton size="inline" tone="subtle" className="disabled:opacity-20" disabled={index === 0 || pending} onClick={() => move(state, -1)} aria-label="Move up">
                    <Icon name="arrow-up" size={12} />
                  </IconButton>
                  <IconButton size="inline" tone="subtle" className="disabled:opacity-20" disabled={index === group.length - 1 || pending} onClick={() => move(state, 1)} aria-label="Move down">
                    <Icon name="arrow-down" size={12} />
                  </IconButton>
                  <IconButton
                    size="inline"
                    tone="subtle"
                    onClick={() => {
                      setEditName(state.name);
                      setRenameError(null);
                      setEditing(state.identifier);
                    }}
                    aria-label={`Rename ${state.name}`}
                  >
                    <Icon name="edit" size={12} />
                  </IconButton>
                  {canManage ? (
                    <IconButton
                      size="inline"
                      tone="subtle-danger"
                      className="disabled:opacity-20"
                      disabled={states.length <= 1}
                      onClick={() => {
                        setDeleting(state.identifier);
                        setReplacement(ordered.find((candidate) => candidate.identifier !== state.identifier)?.identifier ?? "");
                      }}
                      aria-label={`Delete ${state.name}`}
                    >
                      <Icon name="trash" size={12} />
                    </IconButton>
                  ) : null}
                </div>
              ))}
              {canManage && deletingState ? (
                <div className="flex flex-wrap items-center gap-2 bg-background-secondary px-4 py-2 text-xs text-foreground-secondary">
                  Move {deletingState.issueCount} issue{deletingState.issueCount === 1 ? "" : "s"} to
                  <select
                    value={replacement}
                    onChange={(event) => setReplacement(event.target.value)}
                    className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none"
                    aria-label="Replacement status"
                  >
                    {ordered
                      .filter((state) => state.identifier !== deletingState.identifier)
                      .map((state) => (
                        <option key={state.identifier} value={state.identifier}>
                          {state.name}
                        </option>
                      ))}
                  </select>
                  <Button
                    variant="danger"
                    size="small"
                    disabled={pending || !replacement}
                    onClick={() =>
                      startTransition(async () => {
                        await deleteWorkflowState(deletingState.identifier, replacement);
                        setDeleting(null);
                      })
                    }
                  >
                    Delete status
                  </Button>
                  <Button variant="ghost" size="small" onClick={() => setDeleting(null)}>Cancel</Button>
                </div>
              ) : null}
              {addingType === definition.type ? (
                <form
                  className="flex flex-wrap items-center gap-2 bg-background-secondary px-4 py-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const problem = statusNameProblem(newName);
                    if (problem) {
                      setAddError(problem);
                      return;
                    }
                    setAddError(null);
                    startTransition(async () => {
                      try {
                        await createWorkflowState({ name: newName, type: definition.type, color: newColor });
                        setAddingType(null);
                      } catch {
                        setAddError("Could not add the status. Try again.");
                      }
                    });
                  }}
                >
                  <div className="flex items-center gap-1">
                    <ColorSwatches
                      choices={colorChoices}
                      value={newColor}
                      onSelect={setNewColor}
                      size={14}
                      ariaLabelPrefix="Color"
                    />
                  </div>
                  <TextInput value={newName} onChange={(event) => setNewName(event.target.value)} autoFocus placeholder={`New ${definition.name.toLowerCase()} status`} aria-label="Status name" className="w-[220px]" />
                  <Button variant="primary" size="small" type="submit" disabled={pending}>Add</Button>
                  <Button variant="ghost" size="small" onClick={() => setAddingType(null)}>Cancel</Button>
                  {addError ? <span className="text-xs text-danger">{addError}</span> : null}
                </form>
              ) : null}
            </div>
          );
        })}
      {canManage ? null : <AdminOnlyNotice change="delete a status" />}
    </SettingsSection>
  );
};
