import { asc, count } from "drizzle-orm";
import { cache } from "react";

import { getDatabase } from "@/lib/database/client";
import { issues, workflowStates } from "@/lib/database/schema";
import { accessibleIssueCondition, getProjectAccessContext } from "@/lib/projects/access";

import type { IssueStateSummary, WorkflowStateWithIssueCount } from "./types";

/**
 * Every read that embeds a state — a list row, an issue page, a notification —
 * narrows to these, so nothing the summary does not describe reaches a client.
 */
export const issueStateSummaryColumns = {
  identifier: true,
  name: true,
  type: true,
  color: true,
  position: true,
} as const;

/**
 * By stored position, which only orders states within one type: anything
 * showing them side by side sorts with `compareWorkflowStatesForDisplay` first.
 */
export const listStates = cache(async (): Promise<readonly IssueStateSummary[]> => {
  const database = await getDatabase();
  return database.query.workflowStates.findMany({
    orderBy: [asc(workflowStates.position)],
    columns: issueStateSummaryColumns,
  });
});

/**
 * Counted over the issues the reader may see, because `/settings/workflow`
 * renders for every member. An admin, the only one who can act on the numbers,
 * sees every project anyway.
 */
export const listStatesWithIssueCounts = cache(async (): Promise<readonly WorkflowStateWithIssueCount[]> => {
  const [database, context] = await Promise.all([getDatabase(), getProjectAccessContext()]);
  // A grouped select rather than a correlated subquery in `extras`: a
  // relational query with no `with` clause renders the outer table's columns
  // unqualified, and the subquery then silently counts zero for every row.
  const [rows, counts] = await Promise.all([
    listStates(),
    database
      .select({ stateIdentifier: issues.stateIdentifier, issueCount: count() })
      .from(issues)
      .where(accessibleIssueCondition(database, context))
      .groupBy(issues.stateIdentifier),
  ]);
  const issueCounts = new Map(counts.map((row) => [row.stateIdentifier, row.issueCount]));
  return rows.map((row) => ({ ...row, issueCount: issueCounts.get(row.identifier) ?? 0 }));
});
