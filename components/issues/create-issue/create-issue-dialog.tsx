"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { IssueAssigneePicker } from "@/components/issues/pickers/assignee-picker";
import { DueDatePicker } from "@/components/issues/pickers/due-date-picker";
import { EstimatePicker } from "@/components/issues/pickers/estimate-picker";
import { LabelPicker } from "@/components/issues/pickers/label-picker";
import { PriorityPicker } from "@/components/issues/pickers/priority-picker";
import { ProjectPicker } from "@/components/issues/pickers/project-picker";
import { StatePicker } from "@/components/issues/pickers/state-picker";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Kbd } from "@/components/ui/kbd";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast-provider";
import { useModifierKeyLabel } from "@/components/ui/use-modifier-key-label";
import { useWorkspaceData } from "@/components/workspace/workspace-data-provider";
import { createIssue } from "@/lib/issues/actions";

import type { Priority } from "@/lib/database/schema";

import type { CreateIssueDefaults } from "./create-issue-dialog-context";
import { issuePathForReference } from "@/lib/issues/reference";

type CreateIssueDialogProps = {
  readonly open: boolean;
  readonly defaults: CreateIssueDefaults;
  readonly onClose: () => void;
};

/** Must match the title bound `lib/validation/schemas.ts` puts on an issue. */
const maximumTitleLength = 500;

type DraftIssue = {
  readonly title: string;
  readonly description: string;
  readonly stateIdentifier: string | null;
  readonly priority: Priority;
  readonly assigneeIdentifiers: readonly string[];
  readonly labelIdentifiers: readonly string[];
  readonly projectIdentifier: string | null;
  readonly estimate: number | null;
  readonly dueDate: string | null;
  readonly parentIdentifier: string | null;
};

export const CreateIssueDialog = ({ open, defaults, onClose }: CreateIssueDialogProps) => {
  const { members, labels, projects, states, currentUser } = useWorkspaceData();
  const { showToast } = useToast();
  const router = useRouter();
  const modifierKeyLabel = useModifierKeyLabel();
  const [pending, startTransition] = useTransition();
  const [createMore, setCreateMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<DraftIssue>({
    title: defaults.title ?? "",
    description: "",
    stateIdentifier: defaults.stateIdentifier ?? null,
    priority: defaults.priority ?? 0,
    assigneeIdentifiers: defaults.assigneeIdentifiers ?? [],
    labelIdentifiers: defaults.labelIdentifiers ?? [],
    projectIdentifier: defaults.projectIdentifier ?? null,
    estimate: null,
    dueDate: null,
    parentIdentifier: defaults.parentIdentifier ?? null,
  });

  const selectedState =
    states.find((state) => state.identifier === draft.stateIdentifier) ??
    states.find((state) => state.type === "backlog" || state.type === "unstarted") ??
    states[0] ??
    null;
  const selectedAssignees = members.filter((member) =>
    draft.assigneeIdentifiers.includes(member.identifier),
  );
  const selectedLabels = labels.filter((label) => draft.labelIdentifiers.includes(label.identifier));
  const selectedProject = projects.find((project) => project.identifier === draft.projectIdentifier) ?? null;

  const patch = (changes: Partial<DraftIssue>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const submit = () => {
    const title = draft.title.trim();
    if (title.length === 0) {
      setError("Add a title before creating the issue.");
      return;
    }
    if (title.length > maximumTitleLength) {
      setError(`A title is at most ${maximumTitleLength} characters; this one is ${title.length}.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const created = await createIssue({
          title: draft.title,
          description: draft.description.trim().length > 0 ? draft.description : null,
          stateIdentifier: selectedState?.identifier ?? null,
          priority: draft.priority,
          assigneeIdentifiers: [...draft.assigneeIdentifiers],
          labelIdentifiers: [...draft.labelIdentifiers],
          projectIdentifier: draft.projectIdentifier,
          estimate: draft.estimate,
          dueDate: draft.dueDate,
          parentIdentifier: draft.parentIdentifier,
        });
        showToast({
          title: `${created.reference} created`,
          description: draft.title,
          href: issuePathForReference(created.reference),
          tone: "success",
        });
        if (createMore) {
          patch({ title: "", description: "" });
        } else {
          onClose();
        }
        router.refresh();
      } catch {
        setError("Could not create the issue. Try again.");
      }
    });
  };

  return (
    <Dialog open={open} onClose={onClose} ariaLabel="New issue" placement="top" className="max-w-[720px]">
      <div className="flex items-center gap-2 px-4 pt-3 text-xs text-foreground-tertiary">
        <span>{defaults.parentReference ? `Sub-issue of ${defaults.parentReference}` : "New issue"}</span>
        <span className="flex-1" />
        <IconButton size="inline" tone="muted" onClick={onClose} aria-label="Close">
          <Icon name="close" size={14} />
        </IconButton>
      </div>

      <div className="flex flex-col gap-2 px-4 pt-3">
        <input
          data-autofocus
          value={draft.title}
          onChange={(event) => patch({ title: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Issue title"
          aria-label="Issue title"
          className="w-full bg-transparent text-lg font-medium text-foreground outline-none placeholder:text-foreground-quaternary"
        />
        <textarea
          value={draft.description}
          onChange={(event) => patch({ description: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Add description… (Markdown supported)"
          aria-label="Description"
          rows={5}
          className="scrollbar-thin min-h-[96px] w-full resize-y bg-transparent text-[13.5px] leading-6 text-foreground-secondary outline-none placeholder:text-foreground-quaternary"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 pt-1">
        <StatePicker
          value={selectedState}
          variant="chip"
          onSelect={(stateIdentifier) => patch({ stateIdentifier })}
        />
        <PriorityPicker
          value={draft.priority}
          variant="chip"
          onSelect={(priority) => patch({ priority })}
        />
        <IssueAssigneePicker
          value={selectedAssignees}
          variant="chip"
          onChange={(assigneeIdentifiers) => patch({ assigneeIdentifiers })}
        />
        <LabelPicker
          value={selectedLabels}
          onChange={(labelIdentifiers) => patch({ labelIdentifiers })}
        />
        <ProjectPicker
          value={selectedProject}
          onSelect={(projectIdentifier) => patch({ projectIdentifier })}
        />
        <EstimatePicker value={draft.estimate} onSelect={(estimate) => patch({ estimate })} />
        <DueDatePicker value={draft.dueDate} onSelect={(dueDate) => patch({ dueDate })} />
        {!draft.assigneeIdentifiers.includes(currentUser.identifier) ? (
          <button
            type="button"
            onClick={() =>
              patch({ assigneeIdentifiers: [...draft.assigneeIdentifiers, currentUser.identifier] })
            }
            className="h-6 rounded-md px-1.5 text-xs text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground"
          >
            Assign to me
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-3 border-t border-border px-4 py-3">
        {error ? <span className="text-xs text-danger">{error}</span> : null}
        <span className="flex-1" />
        <span className="flex cursor-default items-center gap-2 text-xs text-foreground-tertiary">
          <Switch size="small" checked={createMore} onChange={setCreateMore} label="Create more" />
          Create more
        </span>
        <Button variant="primary" onClick={submit} disabled={pending} trailingIcon={<Kbd keys={`${modifierKeyLabel} ↵`} className="ml-1 opacity-70" />}>
          {pending ? "Creating…" : "Create issue"}
        </Button>
      </div>
    </Dialog>
  );
};

export default CreateIssueDialog;
