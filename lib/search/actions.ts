"use server";

import { z } from "zod";

import type { WorkflowStateType } from "@/lib/database/schema";
import { listIssues } from "@/lib/issues/queries";
import { emptyIssueFilter, everyIssueScope, resolveIssueFilter } from "@/lib/issues/filters";
import { action } from "@/lib/session/action";

export type IssueSearchResult = {
  readonly identifier: string;
  readonly reference: string;
  readonly title: string;
  readonly stateName: string;
  readonly stateType: WorkflowStateType;
  readonly stateColor: string;
};

export const searchIssues = action(async (
  actor,
  rawQuery: string,
  limit: number = 8,
): Promise<readonly IssueSearchResult[]> => {
  const query = z.string().trim().max(200).parse(rawQuery);
  if (query.length === 0) {
    return [];
  }
  const issues = await listIssues(
    everyIssueScope,
    resolveIssueFilter({ ...emptyIssueFilter, search: query }, actor.identifier),
    limit,
  );
  return issues.map((issue) => ({
    identifier: issue.identifier,
    reference: issue.reference,
    title: issue.title,
    stateName: issue.state.name,
    stateType: issue.state.type,
    stateColor: issue.state.color,
  }));
});
