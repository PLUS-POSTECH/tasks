"use client";

import { useTransition, type ReactNode } from "react";

import { MarkdownField } from "@/components/markdown/markdown-field";
import { updateProject } from "@/lib/projects/actions";

type ProjectSummaryEditorProps = {
  readonly projectIdentifier: string;
  readonly summary: string | null;
  readonly content: string | null;
  /** The brief rendered as Markdown on the server. */
  readonly renderedContent: ReactNode;
};

export const ProjectSummaryEditor = ({
  projectIdentifier,
  summary,
  content,
  renderedContent,
}: ProjectSummaryEditorProps) => {
  const [, startTransition] = useTransition();

  return (
    <section className="flex flex-col gap-2">
      <textarea
        defaultValue={summary ?? ""}
        onBlur={(event) => {
          const trimmedSummary = event.target.value.trim();
          if (trimmedSummary !== (summary ?? "")) {
            startTransition(() => updateProject(projectIdentifier, { description: trimmedSummary || null }));
          }
        }}
        rows={1}
        placeholder="Add a short summary…"
        aria-label="Summary"
        className="field-sizing-content w-full resize-none bg-transparent text-[15px] text-foreground-secondary outline-none placeholder:text-foreground-quaternary"
      />
      <MarkdownField
        value={content}
        renderedValue={renderedContent}
        placeholder="Write a project brief… goals, scope, non-goals."
        editorPlaceholder="Write the project brief, goals, scope… Markdown supported."
        readViewAriaLabel="Edit project brief"
        editorAriaLabel="Project document"
        onSave={(draft) => updateProject(projectIdentifier, { content: draft.trim() || null })}
      />
    </section>
  );
};
