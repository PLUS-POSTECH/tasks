"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useModifierKeyLabel } from "@/components/ui/use-modifier-key-label";
import { classNames } from "@/lib/utilities/class-names";
import { isEditableTarget, isOverlayOpen } from "@/lib/utilities/keyboard";

type MarkdownFieldProps = {
  readonly value: string | null;
  /** `value` rendered as Markdown on the server. */
  readonly renderedValue: ReactNode;
  readonly placeholder: string;
  readonly editorPlaceholder: string;
  readonly readViewAriaLabel: string;
  readonly editorAriaLabel: string;
  readonly onSave: (draft: string) => Promise<void>;
  readonly openShortcutKey?: string;
  readonly showSaveShortcut?: boolean;
  readonly animateHover?: boolean;
};

/**
 * The Markdown parser stays on the server: the read view is handed in already
 * rendered, and only the raw source travels to the browser to seed the draft.
 */
export const MarkdownField = ({
  value,
  renderedValue,
  placeholder,
  editorPlaceholder,
  readViewAriaLabel,
  editorAriaLabel,
  onSave,
  openShortcutKey,
  showSaveShortcut,
  animateHover,
}: MarkdownFieldProps) => {
  const modifierKeyLabel = useModifierKeyLabel();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (openShortcutKey === undefined) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === openShortcutKey && !editing && !isEditableTarget(event.target) && !isOverlayOpen() && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setDraft(value ?? "");
        setEditing(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editing, openShortcutKey, value]);

  useEffect(() => {
    if (editing) {
      const textarea = textareaRef.current;
      textarea?.focus();
      textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }, [editing]);

  const save = () => {
    setError(null);
    startTransition(async () => {
      try {
        await onSave(draft);
        setEditing(false);
      } catch {
        setError("Could not save. Your text is still here — try again.");
      }
    });
  };

  const startEditing = () => {
    setDraft(value ?? "");
    setError(null);
    setEditing(true);
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              save();
            }
            if (event.key === "Escape") {
              setEditing(false);
            }
          }}
          rows={8}
          aria-label={editorAriaLabel}
          className="scrollbar-thin field-sizing-content min-h-[160px] w-full resize-y rounded-md border border-border bg-background-secondary px-3 py-2 text-[13.5px] leading-6 text-foreground outline-none focus:border-accent"
          placeholder={editorPlaceholder}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="small"
            onClick={save}
            disabled={pending}
            trailingIcon={showSaveShortcut ? <Kbd keys={`${modifierKeyLabel} ↵`} className="ml-1 opacity-70" /> : undefined}
          >
            Save
          </Button>
          <Button variant="ghost" size="small" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={startEditing}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          startEditing();
        }
      }}
      className={classNames(
        "-mx-2 cursor-text rounded-md px-2 py-1",
        animateHover && "transition-colors",
        "hover:bg-background-secondary",
      )}
      aria-label={readViewAriaLabel}
    >
      {value && value.trim().length > 0 ? (
        renderedValue
      ) : (
        <p className="text-[13.5px] text-foreground-quaternary">{placeholder}</p>
      )}
    </div>
  );
};
