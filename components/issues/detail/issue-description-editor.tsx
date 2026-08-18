"use client";

import type { ReactNode } from "react";

import { MarkdownField } from "@/components/markdown/markdown-field";
import { updateIssueDescription } from "@/lib/issues/actions";

type IssueDescriptionEditorProps = {
  readonly issueIdentifier: string;
  readonly description: string | null;
  /** The description rendered as Markdown on the server. */
  readonly renderedDescription: ReactNode;
};

export const IssueDescriptionEditor = ({
  issueIdentifier,
  description,
  renderedDescription,
}: IssueDescriptionEditorProps) => (
  <MarkdownField
    value={description}
    renderedValue={renderedDescription}
    placeholder="Add description…"
    editorPlaceholder="Add a description… Markdown is supported."
    readViewAriaLabel="Edit description"
    editorAriaLabel="Description"
    onSave={(draft) => updateIssueDescription(issueIdentifier, draft)}
    openShortcutKey="e"
    showSaveShortcut
    animateHover
  />
);
