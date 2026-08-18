import { desc, eq } from "drizzle-orm";
import { cache } from "react";

import { getDatabase } from "@/lib/database/client";
import { apiTokens } from "@/lib/database/schema";

export type ApiTokenSummary = {
  readonly identifier: string;
  readonly name: string;
  readonly tokenPrefix: string;
  readonly lastUsedAt: Date | null;
  readonly createdAt: Date;
};

export const listApiTokens = cache(async (userIdentifier: string): Promise<readonly ApiTokenSummary[]> => {
  const database = await getDatabase();
  const rows = await database.query.apiTokens.findMany({
    where: eq(apiTokens.userIdentifier, userIdentifier),
    orderBy: [desc(apiTokens.createdAt)],
  });
  return rows.map((row) => ({
    identifier: row.identifier,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  }));
});
