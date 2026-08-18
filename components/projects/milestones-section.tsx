"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { ProgressCircle } from "@/components/ui/progress-circle";
import { calendarDateAtLocalMidnight } from "@/lib/formatting/calendar-date";
import { formatShortDate } from "@/lib/formatting/dates";
import { createMilestone, deleteMilestone, updateMilestone } from "@/lib/projects/actions";
import type { ProjectMilestone } from "@/lib/projects/queries";

type MilestonesSectionProps = {
  readonly projectIdentifier: string;
  readonly color: string;
  readonly milestones: readonly ProjectMilestone[];
};

/** Must match the bound `lib/projects/actions.ts` accepts. */
const maximumMilestoneNameLength = 200;

const milestoneNameProblem = (name: string): string | null => {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return "Enter a milestone name.";
  }
  if (trimmed.length > maximumMilestoneNameLength) {
    return `A milestone name is at most ${maximumMilestoneNameLength} characters.`;
  }
  return null;
};

export const MilestonesSection = ({ projectIdentifier, color, milestones }: MilestonesSectionProps) => {
  const [, startTransition] = useTransition();
  const [milestoneDraft, setMilestoneDraft] = useState<{ name: string; targetDate: string } | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [editingMilestone, setEditingMilestone] = useState<string | null>(null);
  const [milestoneEdit, setMilestoneEdit] = useState<{ name: string; targetDate: string }>({ name: "", targetDate: "" });
  const [editError, setEditError] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon name="milestone" size={14} className="text-foreground-tertiary" />
        <h2 className="text-[13px] font-medium text-foreground">Milestones</h2>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            setMilestoneDraft({ name: "", targetDate: "" });
            setDraftError(null);
          }}
          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground"
        >
          <Icon name="plus" size={12} /> Add milestone
        </button>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        {milestones.length === 0 && !milestoneDraft ? (
          <div className="px-3 py-4 text-xs text-foreground-quaternary">Break the project into milestones to track progress.</div>
        ) : null}
        {milestones.map((milestone) => {
          const progress = milestone.progress.total === 0 ? 0 : milestone.progress.completed / milestone.progress.total;
          const editing = editingMilestone === milestone.identifier;
          return (
            <div key={milestone.identifier} className="group/milestone flex h-10 items-center gap-3 border-b border-border-subtle px-3 text-[13px] last:border-b-0 hover:bg-background-secondary">
              <ProgressCircle progress={progress} size={16} color={color} />
              {editing ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const problem = milestoneNameProblem(milestoneEdit.name);
                    if (problem) {
                      setEditError(problem);
                      return;
                    }
                    setEditError(null);
                    startTransition(async () => {
                      try {
                        await updateMilestone(milestone.identifier, {
                          name: milestoneEdit.name,
                          targetDate: milestoneEdit.targetDate || null,
                        });
                        setEditingMilestone(null);
                      } catch {
                        setEditError("Could not save the milestone. Try again.");
                      }
                    });
                  }}
                >
                  <input
                    value={milestoneEdit.name}
                    onChange={(event) => setMilestoneEdit((current) => ({ ...current, name: event.target.value }))}
                    autoFocus
                    aria-label="Milestone name"
                    className="h-7 flex-1 rounded-md border border-border bg-background px-2 outline-none focus:border-accent"
                  />
                  <input
                    type="date"
                    value={milestoneEdit.targetDate}
                    onChange={(event) => setMilestoneEdit((current) => ({ ...current, targetDate: event.target.value }))}
                    aria-label="Target date"
                    className="h-7 rounded-md border border-border bg-background px-2 text-xs outline-none"
                  />
                  <Button variant="primary" size="small" type="submit">Save</Button>
                  <Button variant="ghost" size="small" onClick={() => setEditingMilestone(null)}>Cancel</Button>
                  {editError ? <span className="shrink-0 text-xs text-danger">{editError}</span> : null}
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{milestone.name}</span>
                  <span className="text-xs text-foreground-tertiary">
                    {milestone.progress.completed}/{milestone.progress.total}
                  </span>
                  {milestone.targetDate ? (
                    <span className="text-xs text-foreground-tertiary">{formatShortDate(calendarDateAtLocalMidnight(milestone.targetDate))}</span>
                  ) : null}
                  <span className="flex items-center gap-0.5 md:opacity-0 md:group-hover/milestone:opacity-100">
                    <IconButton
                      size="inline"
                      tone="muted"
                      onClick={() => {
                        setMilestoneEdit({ name: milestone.name, targetDate: milestone.targetDate ?? "" });
                        setEditError(null);
                        setEditingMilestone(milestone.identifier);
                      }}
                      aria-label="Edit milestone"
                    >
                      <Icon name="edit" size={12} />
                    </IconButton>
                    <IconButton
                      size="inline"
                      tone="danger"
                      onClick={() => {
                        // `issues.milestone_identifier` is `set null`, so the
                        // issues lose it without a trace on their own pages.
                        const carrying =
                          milestone.progress.total === 0
                            ? "No issues are on it."
                            : `${milestone.progress.total} issue${milestone.progress.total === 1 ? "" : "s"} will lose it.`;
                        if (window.confirm(`Delete milestone "${milestone.name}"? ${carrying} This cannot be undone.`)) {
                          startTransition(() => deleteMilestone(milestone.identifier));
                        }
                      }}
                      aria-label="Delete milestone"
                    >
                      <Icon name="trash" size={12} />
                    </IconButton>
                  </span>
                </>
              )}
            </div>
          );
        })}
        {milestoneDraft ? (
          <form
            className="flex h-10 items-center gap-2 px-3"
            onSubmit={(event) => {
              event.preventDefault();
              const problem = milestoneNameProblem(milestoneDraft.name);
              if (problem) {
                setDraftError(problem);
                return;
              }
              setDraftError(null);
              startTransition(async () => {
                try {
                  await createMilestone(projectIdentifier, {
                    name: milestoneDraft.name,
                    targetDate: milestoneDraft.targetDate || null,
                  });
                  setMilestoneDraft(null);
                } catch {
                  setDraftError("Could not add the milestone. Try again.");
                }
              });
            }}
          >
            <input
              value={milestoneDraft.name}
              onChange={(event) => setMilestoneDraft({ ...milestoneDraft, name: event.target.value })}
              autoFocus
              placeholder="Milestone name"
              aria-label="Milestone name"
              className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-[13px] outline-none focus:border-accent"
            />
            <input
              type="date"
              value={milestoneDraft.targetDate}
              onChange={(event) => setMilestoneDraft({ ...milestoneDraft, targetDate: event.target.value })}
              aria-label="Target date"
              className="h-7 rounded-md border border-border bg-background px-2 text-xs outline-none"
            />
            <Button variant="primary" size="small" type="submit">Add</Button>
            <Button variant="ghost" size="small" onClick={() => setMilestoneDraft(null)}>Cancel</Button>
            {draftError ? <span className="shrink-0 text-xs text-danger">{draftError}</span> : null}
          </form>
        ) : null}
      </div>
    </section>
  );
};
