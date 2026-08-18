"use client";

import { useState, useTransition, type ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Timestamp } from "@/components/ui/timestamp";
import { useWorkspaceData } from "@/components/workspace/workspace-data-provider";
import { deleteComment } from "@/lib/issues/actions";
import type { CommentSummary } from "@/lib/issues/detail-queries";

export type RenderedReply = {
  readonly comment: CommentSummary;
  /** The body rendered as Markdown on the server; null once the reply is deleted. */
  readonly renderedBody: ReactNode;
};

type CommentRepliesProps = {
  readonly replies: readonly RenderedReply[];
  readonly children?: ReactNode;
};

export const CommentReplies = ({ replies, children }: CommentRepliesProps) => {
  const { currentUser } = useWorkspaceData();
  const [, startTransition] = useTransition();
  const [refusedDeletionIdentifier, setRefusedDeletionIdentifier] = useState<string | null>(null);

  return (
    <div className="ml-4 mt-2 flex flex-col gap-2 border-l-2 border-border-subtle pl-3">
      {replies.map(({ comment: reply, renderedBody: renderedReplyBody }) => (
        <div key={reply.identifier} className="flex gap-2">
          {reply.status === "visible" && reply.author ? (
            <Avatar name={reply.author.name} color={reply.author.avatarColor} image={reply.author.image} size={18} className="mt-1" />
          ) : null}
          <div className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2">
            {reply.status === "visible" ? (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-foreground">{reply.author?.name ?? "Former member"}</span>
                  <Timestamp value={reply.createdAt} format="relative" className="text-foreground-quaternary" />
                  <span className="flex-1" />
                  {reply.author?.identifier === currentUser.identifier || currentUser.isAdmin ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Delete this comment? This cannot be undone.")) {
                          setRefusedDeletionIdentifier(null);
                          startTransition(async () => {
                            try {
                              await deleteComment(reply.identifier);
                            } catch {
                              setRefusedDeletionIdentifier(reply.identifier);
                            }
                          });
                        }
                      }}
                      className="rounded p-0.5 text-foreground-quaternary hover:text-danger"
                      aria-label="Delete reply"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  ) : null}
                </div>
                {renderedReplyBody}
                {refusedDeletionIdentifier === reply.identifier ? (
                  <p className="text-xs text-danger">Could not delete this reply. Try again.</p>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-foreground-tertiary">This comment was deleted</p>
            )}
          </div>
        </div>
      ))}
      {children}
    </div>
  );
};
