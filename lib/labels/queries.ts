import { asc, count, eq } from "drizzle-orm";
import { cache } from "react";

import { getDatabase } from "@/lib/database/client";
import { issueLabels, issues, labels } from "@/lib/database/schema";
import { accessibleIssueCondition, getProjectAccessContext } from "@/lib/projects/access";

import type { LabelSummary, LabelWithIssueCount } from "./types";

export const listLabels = cache(async (): Promise<readonly LabelSummary[]> => {
  const database = await getDatabase();
  return database.query.labels.findMany({
    orderBy: [asc(labels.name)],
    columns: { identifier: true, name: true, color: true },
  });
});

/**
 * Counted over the issues the reader may see, because `/settings/labels`
 * renders for every member. An admin, the only one who can act on the numbers,
 * sees every project anyway.
 */
export const listLabelsWithIssueCounts = cache(async (): Promise<readonly LabelWithIssueCount[]> => {
  const [database, context] = await Promise.all([getDatabase(), getProjectAccessContext()]);
  // A grouped select rather than a correlated subquery in `extras`: a
  // relational query with no `with` clause renders the outer table's columns
  // unqualified, and the subquery then silently counts zero for every row.
  const [rows, counts] = await Promise.all([
    listLabels(),
    database
      .select({ labelIdentifier: issueLabels.labelIdentifier, issueCount: count() })
      .from(issueLabels)
      .innerJoin(issues, eq(issues.identifier, issueLabels.issueIdentifier))
      .where(accessibleIssueCondition(database, context))
      .groupBy(issueLabels.labelIdentifier),
  ]);
  const issueCounts = new Map(counts.map((row) => [row.labelIdentifier, row.issueCount]));
  return rows.map((row) => ({ ...row, issueCount: issueCounts.get(row.identifier) ?? 0 }));
});
