import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";

import { getDatabase } from "@/lib/database/client";
import { seedDevelopmentDatabase } from "@/lib/database/development";
import { accounts, users, workspaces } from "@/lib/database/schema";
import { getDiscordRoleIdentifiers } from "@/lib/discord/roles";
import { getWorkspace } from "@/lib/workspace/queries";

/**
 * The role snapshot on a member's row is what admin and project access follow
 * between syncs. Discord answers 404 both for a member who is absent and for a
 * server the bot cannot see, so a failed refresh is not "holds no roles".
 */

const guild = "700000000000000000";
const originalFetch = globalThis.fetch;

let memberResponse: () => Response = () => Response.json({ roles: [] });
let memberReads = 0;
const memberIdentifiers: string[] = [];

const staleSnapshotAt = new Date(Date.now() - 60 * 60_000);

const insertMemberWithSnapshot = async (
  name: string,
  discordUserIdentifier: string,
  roleIdentifiers: readonly string[],
): Promise<string> => {
  const database = await getDatabase();
  const workspace = await getWorkspace();
  const [member] = await database
    .insert(users)
    .values({
      workspaceIdentifier: workspace.identifier,
      name,
      displayName: discordUserIdentifier,
      email: `${discordUserIdentifier}@acme.dev`,
      avatarColor: "#eb5757",
      discordUserIdentifier,
      discordRoleIdentifiers: roleIdentifiers,
      discordRolesSyncedAt: staleSnapshotAt,
    })
    .returning({ identifier: users.id });
  if (!member) {
    throw new Error(`The member ${name} was not created.`);
  }
  await database
    .insert(accounts)
    .values({ userId: member.identifier, providerId: "discord", accountId: discordUserIdentifier });
  memberIdentifiers.push(member.identifier);
  return member.identifier;
};

const readSnapshot = async (memberIdentifier: string) => {
  const database = await getDatabase();
  const member = await database.query.users.findFirst({
    where: eq(users.id, memberIdentifier),
    columns: { discordRoleIdentifiers: true, discordRolesSyncedAt: true },
  });
  if (!member) {
    throw new Error("The member is gone.");
  }
  return member;
};

beforeAll(async () => {
  await seedDevelopmentDatabase();
  const database = await getDatabase();
  await database.update(workspaces).set({ discordBotToken: "test-bot-token", discordGuildIdentifier: guild });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes(`/guilds/${guild}/members/`)) {
      memberReads += 1;
      return memberResponse();
    }
    throw new Error(`Unexpected fetch ${url}`);
  }) as typeof fetch;
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  const database = await getDatabase();
  await database.update(workspaces).set({ discordBotToken: null });
  // The suite shares one database, so the members this file invented go away.
  await database.delete(users).where(inArray(users.id, memberIdentifiers));
});

describe("a member's Discord role snapshot", () => {
  test("follows the server while the bot can read it", async () => {
    const member = await insertMemberWithSnapshot("Role Reader", "700000000000000001", ["role-club"]);
    memberResponse = () => Response.json({ roles: ["role-club", "role-core"] });
    expect(await getDiscordRoleIdentifiers(member)).toEqual(["role-club", "role-core"]);
    const stored = await readSnapshot(member);
    expect(stored.discordRoleIdentifiers).toEqual(["role-club", "role-core"]);
    expect(stored.discordRolesSyncedAt?.getTime()).toBeGreaterThan(staleSnapshotAt.getTime());
  });

  test("survives a server that will not show the member", async () => {
    const member = await insertMemberWithSnapshot("Role Keeper", "700000000000000002", ["role-club"]);
    memberResponse = () => new Response('{"message": "Unknown Guild", "code": 10004}', { status: 404 });

    expect(await getDiscordRoleIdentifiers(member)).toEqual(["role-club"]);
    const stored = await readSnapshot(member);
    expect(stored.discordRoleIdentifiers).toEqual(["role-club"]);
    // Nothing was learned, so nothing was stamped as freshly known either.
    expect(stored.discordRolesSyncedAt?.getTime()).toBe(staleSnapshotAt.getTime());
  });

  test("is not re-read on every request while Discord is unreachable", async () => {
    const member = await insertMemberWithSnapshot("Role Waiter", "700000000000000003", ["role-club"]);
    memberResponse = () => {
      throw new Error("connect ECONNREFUSED discord.com");
    };
    const readsBefore = memberReads;

    // Three page loads by the same member: one Discord call between them, not one
    // each.
    for (let pageLoad = 0; pageLoad < 3; pageLoad += 1) {
      expect(await getDiscordRoleIdentifiers(member)).toEqual(["role-club"]);
    }
    expect(memberReads - readsBefore).toBe(1);

    memberResponse = () => Response.json({ roles: [] });
  });
});
