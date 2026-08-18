"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useTransition } from "react";

import { useCreateIssueDialog } from "@/components/issues/create-issue/create-issue-dialog-context";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Popover } from "@/components/ui/popover";
import { SelectMenu } from "@/components/ui/select-menu";
import { useToast } from "@/components/ui/toast-provider";
import { Tooltip } from "@/components/ui/tooltip";
import { deleteIssue, toggleIssueSubscription } from "@/lib/issues/actions";
import { classNames } from "@/lib/utilities/class-names";
import { issuePathForReference } from "@/lib/issues/reference";

type IssueHeaderActionsProps = {
  readonly issueIdentifier: string;
  readonly reference: string;
  readonly title: string;
  readonly projectIdentifier: string | null;
  readonly isSubscribed: boolean;
  readonly canDelete: boolean;
  readonly commentCount: number;
  readonly reminderCount: number;
  readonly subIssueCount: number;
};

const countedNoun = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;

const deletionCost = (commentCount: number, reminderCount: number, subIssueCount: number): string => {
  const cascades = [
    ...(commentCount > 0 ? [countedNoun(commentCount, "comment")] : []),
    ...(reminderCount > 0 ? [countedNoun(reminderCount, "reminder")] : []),
  ];
  return [
    cascades.length > 0 ? `It takes ${cascades.join(" and ")} with it.` : null,
    subIssueCount === 0
      ? null
      : subIssueCount === 1
        ? "Its sub-issue becomes a top-level issue."
        : `Its ${subIssueCount} sub-issues become top-level issues.`,
    "This cannot be undone.",
  ]
    .filter((sentence) => sentence !== null)
    .join(" ");
};

export const IssueHeaderActions = ({
  issueIdentifier,
  reference,
  title,
  projectIdentifier,
  isSubscribed,
  canDelete,
  commentCount,
  reminderCount,
  subIssueCount,
}: IssueHeaderActionsProps) => {
  const router = useRouter();
  const { showToast } = useToast();
  const { openCreateIssue } = useCreateIssueDialog();
  const [, startTransition] = useTransition();

  const copyLink = useCallback(() => {
    void navigator.clipboard.writeText(`${window.location.origin}${issuePathForReference(reference)}`);
    showToast({ title: "Issue link copied", description: reference });
  }, [reference, showToast]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === ".") {
        event.preventDefault();
        copyLink();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [copyLink]);

  return (
    <div className="flex items-center gap-0.5">
      <Tooltip label="Copy link" shortcut="⌘ ⇧ ." side="bottom">
        <IconButton size="rail" tone="muted" onClick={copyLink} aria-label="Copy issue link">
          <Icon name="link" size={15} />
        </IconButton>
      </Tooltip>
      <Tooltip label={isSubscribed ? "Unsubscribe" : "Subscribe"} side="bottom">
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await toggleIssueSubscription(issueIdentifier);
            })
          }
          aria-pressed={isSubscribed}
          aria-label="Subscribe"
          className={classNames(
            "flex h-7 w-7 items-center justify-center rounded-md hover:bg-background-tertiary",
            isSubscribed ? "text-accent" : "text-foreground-tertiary hover:text-foreground",
          )}
        >
          <Icon name="bell" size={15} />
        </button>
      </Tooltip>
      <Popover
        align="end"
        trigger={
          <IconButton size="rail" tone="muted" aria-label="More actions">
            <Icon name="more" size={15} />
          </IconButton>
        }
      >
        {(close) => (
          <SelectMenu
            searchable={false}
            items={[
              { value: "sub-issue", label: "Create sub-issue", icon: <Icon name="sub-issue" size={14} /> },
              { value: "copy-reference", label: "Copy issue reference", icon: <Icon name="copy" size={14} /> },
              { value: "copy-title", label: "Copy reference and title", icon: <Icon name="copy" size={14} /> },
              ...(canDelete
                ? [{ value: "delete", label: "Delete…", icon: <Icon name="trash" size={14} className="text-danger" /> }]
                : []),
            ]}
            onSelect={(value) => {
              close();
              switch (value) {
                case "sub-issue":
                  openCreateIssue({
                    parentIdentifier: issueIdentifier,
                    parentReference: reference,
                    projectIdentifier,
                  });
                  return;
                case "copy-reference":
                  void navigator.clipboard.writeText(reference);
                  showToast({ title: "Copied", description: reference });
                  return;
                case "copy-title":
                  void navigator.clipboard.writeText(`${reference} ${title}`);
                  showToast({ title: "Copied", description: `${reference} ${title}` });
                  return;
                case "delete":
                  if (window.confirm(`Delete ${reference}? ${deletionCost(commentCount, reminderCount, subIssueCount)}`)) {
                    startTransition(async () => {
                      await deleteIssue(issueIdentifier);
                      showToast({ title: `${reference} deleted`, tone: "danger" });
                      router.push("/issues/active");
                    });
                  }
              }
            }}
          />
        )}
      </Popover>
    </div>
  );
};
