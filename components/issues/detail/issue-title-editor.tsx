"use client";

import { useState, useTransition } from "react";

import { updateIssueTitle } from "@/lib/issues/actions";

type IssueTitleEditorProps = {
  readonly issueIdentifier: string;
  readonly title: string;
};

export const IssueTitleEditor = ({ issueIdentifier, title }: IssueTitleEditorProps) => {
  const [draft, setDraft] = useState(title);
  const [lastSavedTitle, setLastSavedTitle] = useState(title);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (title !== lastSavedTitle) {
    setLastSavedTitle(title);
    setDraft(title);
  }

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || trimmed === title) {
      setDraft(title);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await updateIssueTitle(issueIdentifier, trimmed);
      } catch {
        setError("Could not save the title. Your text is still here — try again.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setDraft(title);
            event.currentTarget.blur();
          }
        }}
        rows={1}
        aria-label="Issue title"
        className="field-sizing-content w-full resize-none bg-transparent text-[22px] font-semibold leading-8 tracking-tight text-foreground outline-none placeholder:text-foreground-quaternary"
        placeholder="Issue title"
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
};
