"use client";

import { useCreateIssueDialog } from "@/components/issues/create-issue/create-issue-dialog-context";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";

type NewIssueButtonProps = {
  readonly stateIdentifier?: string;
  readonly projectIdentifier?: string;
};

export const NewIssueButton = ({ stateIdentifier, projectIdentifier }: NewIssueButtonProps) => {
  const { openCreateIssue } = useCreateIssueDialog();
  return (
    <Tooltip label="New issue" shortcut="C" side="bottom">
      <Button
        variant="secondary"
        size="small"
        leadingIcon={<Icon name="plus" size={13} />}
        onClick={() => openCreateIssue({ stateIdentifier, projectIdentifier })}
      >
        New issue
      </Button>
    </Tooltip>
  );
};
