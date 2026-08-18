"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AssigneePicker } from "@/components/issues/pickers/assignee-picker";
import { Button } from "@/components/ui/button";
import { ColorSwatches } from "@/components/ui/color-swatches";
import { Dialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Popover } from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast-provider";
import { useWorkspaceData } from "@/components/workspace/workspace-data-provider";
import type { ProjectStatus } from "@/lib/database/schema";
import { createProject } from "@/lib/projects/actions";

import { ProjectStatusPicker } from "./project-status-picker";

type CreateProjectDialogProps = {
  readonly open: boolean;
  readonly onClose: () => void;
};

const iconChoices = ["▣", "◆", "◉", "◈", "▤", "▯", "◔", "⌘", "✦", "❖", "⬢", "▲"] as const;
const colorChoices = ["#5e6ad2", "#26b5ce", "#f2994a", "#eb5757", "#27ae60", "#bb87fc", "#f2c94c", "#4ea7fc", "#8a8f98"] as const;

export const CreateProjectDialog = ({ open, onClose }: CreateProjectDialogProps) => {
  const { members } = useWorkspaceData();
  const { showToast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string>(iconChoices[0]);
  const [color, setColor] = useState<string>(colorChoices[0]);
  const [status, setStatus] = useState<ProjectStatus>("planned");
  const [leadIdentifier, setLeadIdentifier] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const lead = members.find((member) => member.identifier === leadIdentifier) ?? null;

  const submit = () => {
    if (name.trim().length === 0) {
      setError("Give the project a name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const created = await createProject({
          name,
          description: description.trim() ? description : null,
          icon,
          color,
          status,
          leadIdentifier,
          startDate: startDate || null,
          targetDate: targetDate || null,
        });
        showToast({ title: "Project created", description: name, href: `/project/${created.identifier}`, tone: "success" });
        onClose();
        router.push(`/project/${created.identifier}`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Failed to create the project.");
      }
    });
  };

  return (
    <Dialog open={open} onClose={onClose} ariaLabel="New project" placement="top" className="max-w-[640px]">
      <div className="flex items-center gap-2 px-4 pt-3 text-xs text-foreground-tertiary">
        <span>New project</span>
        <span className="flex-1" />
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-background-tertiary hover:text-foreground">
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="flex flex-col gap-3 px-4 pt-3">
        <div className="flex items-start gap-3">
          <Popover
            trigger={
              <button
                type="button"
                aria-label="Choose icon"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl hover:brightness-110"
                style={{ color, backgroundColor: `${color}1a` }}
              >
                {icon}
              </button>
            }
          >
            <div className="flex w-[232px] flex-col gap-2 p-3">
              <div className="grid grid-cols-6 gap-1">
                {iconChoices.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setIcon(choice)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-base hover:bg-background-tertiary"
                    aria-label={`Icon ${choice}`}
                  >
                    {choice}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <ColorSwatches
                  choices={colorChoices}
                  value={color}
                  onSelect={setColor}
                  size={20}
                  ariaLabelPrefix="Color"
                  className="ring-offset-2 ring-offset-surface"
                />
              </div>
            </div>
          </Popover>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <input
              data-autofocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  submit();
                }
              }}
              placeholder="Project name"
              aria-label="Project name"
              className="w-full bg-transparent text-lg font-medium text-foreground outline-none placeholder:text-foreground-quaternary"
            />
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add a short summary…"
              aria-label="Summary"
              rows={2}
              className="w-full resize-none bg-transparent text-[13.5px] text-foreground-secondary outline-none placeholder:text-foreground-quaternary"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ProjectStatusPicker value={status} onSelect={setStatus} />
          <AssigneePicker value={lead} variant="chip" onSelect={setLeadIdentifier} />
          <label className="inline-flex h-6 items-center gap-1.5 rounded-md border border-border px-1.5 text-xs text-foreground-secondary">
            <Icon name="calendar" size={13} /> Start
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="bg-transparent text-xs outline-none" aria-label="Start date" />
          </label>
          <label className="inline-flex h-6 items-center gap-1.5 rounded-md border border-border px-1.5 text-xs text-foreground-secondary">
            <Icon name="target" size={13} /> Target
            <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className="bg-transparent text-xs outline-none" aria-label="Target date" />
          </label>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 border-t border-border px-4 py-3">
        {error ? <span className="text-xs text-danger">{error}</span> : null}
        <span className="flex-1" />
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={pending}>
          {pending ? "Creating…" : "Create project"}
        </Button>
      </div>
    </Dialog>
  );
};

export default CreateProjectDialog;
