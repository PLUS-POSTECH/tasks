import type { WorkflowStateType } from "@/lib/database/schema";

export type IssueStateSummary = {
  readonly identifier: string;
  readonly name: string;
  readonly type: WorkflowStateType;
  readonly color: string;
  readonly position: number;
};

/**
 * Deleting a status moves every issue in it to a replacement, so the settings
 * page says how many before it asks which.
 */
export type WorkflowStateWithIssueCount = IssueStateSummary & {
  readonly issueCount: number;
};
