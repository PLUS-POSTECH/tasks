import type { IssueRelationType } from "@/lib/database/schema";
import type { LabelSummary } from "@/lib/labels/types";
import type { ProjectSummary } from "@/lib/projects/types";
import type { UserSummary } from "@/lib/users/types";
import type { IssueStateSummary } from "@/lib/workflow/types";

export type IssueListItem = {
  readonly identifier: string;
  readonly number: number;
  readonly reference: string;
  readonly title: string;
  readonly priority: number;
  readonly estimate: number | null;
  readonly dueDate: string | null;
  readonly sortOrder: number;
  readonly boardOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly state: IssueStateSummary;
  readonly assignee: UserSummary | null;
  readonly creator: UserSummary | null;
  readonly labels: readonly LabelSummary[];
  readonly project: ProjectSummary | null;
  readonly parent: {
    readonly identifier: string;
    readonly reference: string;
    readonly title: string;
  } | null;
  readonly subIssueCount: number;
  readonly completedSubIssueCount: number;
  readonly isBlocked: boolean;
  readonly commentCount: number;
};

export type IssueRelationSummary = {
  readonly identifier: string;
  readonly type: IssueRelationType;
  readonly issue: {
    readonly identifier: string;
    readonly reference: string;
    readonly title: string;
    readonly state: IssueStateSummary;
  };
};

export const invertedRelationType = (type: IssueRelationType): IssueRelationType =>
  type === "blocks" ? "blocked_by" : type === "blocked_by" ? "blocks" : type;
