import { sql } from "drizzle-orm";

import { getDatabase } from "@/lib/database/client";

export const dynamic = "force-dynamic";

/** Unauthenticated: it reports whether the database answers and nothing else. */
export const GET = async (): Promise<Response> => {
  try {
    const database = await getDatabase();
    await database.execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch (error) {
    console.warn("[health] The database did not answer.", error);
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
};
