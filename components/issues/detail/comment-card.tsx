"use client";

import { useState, useTransition, type ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { useWorkspaceData } from "@/components/workspace/workspace-data-provider";
import { deleteComment, editComment } from "@/lib/issues/actions";
import type { VisibleCommentSummary } from "@/lib/issues/detail-queries";

import { CommentComposer } from "./comment-composer";
import { CommentReplies, type RenderedReply } from "./comment-replies";
import { Timestamp } from "@/components/ui/timestamp";

type CommentCardProps = {
  readonly issueIdentifier: string;
  readonly comment: VisibleCommentSummary;
  /** The comment body rendered as Markdown on the server. */
  readonly renderedBody: ReactNode;
  readonly replies: readonly RenderedReply[];
};

export const CommentCard = ({ issueIdentifier, comment, renderedBody, replies }: CommentCardProps) => {
  const { currentUser } = useWorkspaceData();
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [pending, startTransition] = useTransition();
  const [editError, setEditError] = useState<string | null>(null);
  const isOwn = comment.author?.identifier === currentUser.identifier;
  // `deleteComment` draws the same line: an admin moderates the thread, while
  // editing would be writing under somebody else's name.
  const canDelete = isOwn || currentUser.isAdmin;

  const saveEdit = () => {
    if (draft.trim().length === 0) {
      return;
    }
    setEditError(null);
    startTransition(async () => {
      try {
        await editComment(comment.identifier, draft);
        setEditing(false);
      } catch {
        setEditError("Could not save. Your text is still here — try again.");
      }
    });
  };

  return (
    <div className="flex gap-3">
      {comment.author ? (
        <Avatar name={comment.author.name} color={comment.author.avatarColor} image={comment.author.image} size={24} className="mt-1" />
      ) : (
        <span className="mt-1 h-6 w-6 rounded-full bg-background-tertiary" />
      )}
      <div className="min-w-0 flex-1">
        <div className="group/comment rounded-lg border border-border bg-surface">
          <div className="flex items-center gap-2 px-3 pt-2 text-xs">
            <span className="font-medium text-foreground">{comment.author?.name ?? "Former member"}</span>
            <Timestamp value={comment.createdAt} format="relative" className="text-foreground-quaternary" />
            {comment.editedAt ? <span className="text-foreground-quaternary">(edited)</span> : null}
            <span className="flex-1" />
            <span className="flex items-center gap-0.5 transition-opacity md:opacity-0 md:group-hover/comment:opacity-100">
              <IconButton
                size="inline"
                tone="muted"
                onClick={() => setReplying(true)}
                aria-label="Reply"
                title="Reply"
              >
                <Icon name="comment" size={13} />
              </IconButton>
              {isOwn ? (
                <IconButton
                  size="inline"
                  tone="muted"
                  onClick={() => {
                    setDraft(comment.body);
                    setEditing(true);
                  }}
                  aria-label="Edit"
                  title="Edit"
                >
                  <Icon name="edit" size={13} />
                </IconButton>
              ) : null}
              {canDelete ? (
                <IconButton
                  size="inline"
                  tone="danger"
                  onClick={() => {
                    if (window.confirm("Delete this comment? This cannot be undone.")) {
                      startTransition(() => deleteComment(comment.identifier));
                    }
                  }}
                  aria-label="Delete"
                  title="Delete"
                >
                  <Icon name="trash" size={13} />
                </IconButton>
              ) : null}
            </span>
          </div>
          <div className="px-3 pb-3 pt-1">
            {editing ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      saveEdit();
                    }
                    if (event.key === "Escape") {
                      setEditing(false);
                    }
                  }}
                  rows={3}
                  autoFocus
                  aria-label="Edit comment"
                  className="field-sizing-content w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-[13.5px] leading-6 text-foreground outline-none focus:border-accent"
                />
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="small"
                    disabled={pending || draft.trim().length === 0}
                    onClick={saveEdit}
                  >
                    Save
                  </Button>
                  <Button variant="ghost" size="small" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  {editError ? <p className="self-center text-xs text-danger">{editError}</p> : null}
                </div>
              </div>
            ) : (
              renderedBody
            )}
          </div>
        </div>
        {replies.length > 0 || replying ? (
          <CommentReplies replies={replies}>
            {replying ? (
              <CommentComposer
                issueIdentifier={issueIdentifier}
                parentCommentIdentifier={comment.identifier}
                onSubmitted={() => setReplying(false)}
                autoFocus
                compact
              />
            ) : null}
          </CommentReplies>
        ) : null}
      </div>
    </div>
  );
};
