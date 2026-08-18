"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { issueSearchParameters } from "@/lib/issues/filters";

import { useIssueViewUrl } from "./use-issue-view-url";

type LoadMoreIssuesProps = {
  readonly nextIssueCount: number;
};

export const LoadMoreIssues = ({ nextIssueCount }: LoadMoreIssuesProps) => {
  const { update } = useIssueViewUrl();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex shrink-0 items-center justify-center py-3">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(() =>
            update({ [issueSearchParameters.loadedIssues]: String(nextIssueCount) }),
          )
        }
      >
        {pending ? "Loading…" : "Load more"}
      </Button>
    </div>
  );
};
