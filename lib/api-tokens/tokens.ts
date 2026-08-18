import { eq } from "drizzle-orm";

import { getDatabase } from "@/lib/database/client";
import { apiTokens } from "@/lib/database/schema";
import type { ActorContext } from "@/lib/session/actor-context";

const tokenPrefix = "tsk_";

const sha256 = async (value: string): Promise<string> =>
  Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))).toString("hex");

export const generateApiToken = async (): Promise<{ readonly token: string; readonly hash: string; readonly prefix: string }> => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = `${tokenPrefix}${Buffer.from(bytes).toString("base64url")}`;
  return { token, hash: await sha256(token), prefix: token.slice(0, tokenPrefix.length + 6) };
};

/**
 * Tokens do not expire — they last until they are revoked, which deletes the
 * row — so there is no expiry to check. Whether the owner may still act is a
 * separate question, settled by `requireActor`.
 */
export const resolveApiToken = async (token: string): Promise<ActorContext | null> => {
  if (!token.startsWith(tokenPrefix)) {
    return null;
  }
  const database = await getDatabase();
  const now = new Date();
  const row = await database.query.apiTokens.findFirst({
    where: eq(apiTokens.tokenHash, await sha256(token)),
    columns: { identifier: true, userIdentifier: true },
  });
  if (!row) {
    return null;
  }
  await database.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.identifier, row.identifier));
  return { userIdentifier: row.userIdentifier, via: "api-token", tokenIdentifier: row.identifier };
};

export const bearerToken = (request: Request): string | null => {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
};
