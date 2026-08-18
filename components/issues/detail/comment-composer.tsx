"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useModifierKeyLabel } from "@/components/ui/use-modifier-key-label";
import { useWorkspaceData } from "@/components/workspace/workspace-data-provider";
import { addComment } from "@/lib/issues/actions";
import { isEditableTarget, isOverlayOpen } from "@/lib/utilities/keyboard";

type CommentComposerProps = {
  readonly issueIdentifier: string;
  readonly parentCommentIdentifier?: string | null;
  readonly onSubmitted?: () => void;
  readonly autoFocus?: boolean;
  readonly compact?: boolean;
};

export const CommentComposer = ({
  issueIdentifier,
  parentCommentIdentifier = null,
  onSubmitted,
  autoFocus = false,
  compact = false,
}: CommentComposerProps) => {
  const { currentUser } = useWorkspaceData();
  const modifierKeyLabel = useModifierKeyLabel();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    if (parentCommentIdentifier) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "r" && !isEditableTarget(event.target) && !isOverlayOpen() && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        textareaRef.current?.focus();
        textareaRef.current?.scrollIntoView({ block: "center" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [parentCommentIdentifier]);

  const submit = () => {
    if (body.trim().length === 0) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await addComment(issueIdentifier, body, parentCommentIdentifier);
        setBody("");
        onSubmitted?.();
      } catch {
        setError("Could not post. Your text is still here — try again.");
      }
    });
  };

  return (
    <div className={compact ? "flex gap-2" : "flex gap-3"}>
      {compact ? null : (
        <Avatar name={currentUser.name} color={currentUser.avatarColor} image={currentUser.image} size={24} className="mt-1" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-border bg-surface p-2 focus-within:border-border-strong">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
          rows={compact ? 2 : 3}
          placeholder={parentCommentIdentifier ? "Reply…" : "Leave a comment…"}
          aria-label={parentCommentIdentifier ? "Reply" : "Comment"}
          className="scrollbar-thin field-sizing-content w-full resize-none bg-transparent px-1 text-[13.5px] leading-6 text-foreground outline-none placeholder:text-foreground-quaternary"
        />
        <div className="flex items-center justify-end gap-2">
          {error ? <p className="mr-auto text-xs text-danger">{error}</p> : null}
          {parentCommentIdentifier && onSubmitted ? (
            <Button variant="ghost" size="small" onClick={onSubmitted}>
              Cancel
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="small"
            onClick={submit}
            disabled={pending || body.trim().length === 0}
            trailingIcon={<Kbd keys={`${modifierKeyLabel} ↵`} className="ml-1 opacity-70" />}
          >
            {parentCommentIdentifier ? "Reply" : "Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
};
