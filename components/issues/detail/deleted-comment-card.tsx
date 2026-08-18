import { CommentReplies, type RenderedReply } from "./comment-replies";

type DeletedCommentCardProps = {
  readonly replies: readonly RenderedReply[];
};

/**
 * Carries nothing of what was written or who wrote it: the row survives only
 * to hold the replies filed under it.
 */
export const DeletedCommentCard = ({ replies }: DeletedCommentCardProps) => (
  <div className="flex gap-3">
    <span className="mt-1 h-6 w-6 rounded-full bg-background-tertiary" />
    <div className="min-w-0 flex-1">
      <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground-tertiary">
        This comment was deleted
      </div>
      {replies.length > 0 ? <CommentReplies replies={replies} /> : null}
    </div>
  </div>
);
