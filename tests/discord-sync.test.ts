import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";

import { generateApiToken } from "@/lib/api-tokens/tokens";
import { adminReasonOf, loadAdminPolicy } from "@/lib/auth/admin";
import { getDatabase } from "@/lib/database/client";
import { seedDevelopmentDatabase } from "@/lib/database/development";
import {
  accounts,
  apiTokens,
  discordWebhooks,
  issueReminders,
  sessions,
  users,
  workspaces,
} from "@/lib/database/schema";
import { placeholderEmail } from "@/lib/discord/placeholder-email";
import { linkSyncedMember, syncDiscordGuild } from "@/lib/discord/sync";
import { toUserSummary } from "@/lib/users/summary";
import { getWorkspace,  } from "@/lib/workspace/queries";
import { listMembers } from "@/lib/users/queries";

const guild = "100000000000000000";
const originalFetch = globalThis.fetch;

type RosterEntry = {
  user: { id: string; username: string; global_name?: string | null; avatar: string | null; bot?: boolean };
  nick: string | null;
  avatar?: string | null;
  roles: string[];
};

let profile: { id: string; name: string; icon: string | null; owner_id: string } = {
  id: guild,
  name: "PLUS",
  icon: "abc123",
  owner_id: "100000000000000001",
};
// "role-a" is the workspace's own admin role; "role-super" carries Discord's.
const guildRoles = [
  { id: "role-a", name: "Maintainer", color: 0, position: 2, permissions: "0" },
  { id: "role-super", name: "Owner crew", color: 0, position: 3, permissions: "8" },
];
let roster: RosterEntry[] = [
  { user: { id: "100000000000000001", username: "alice", global_name: "Alice", avatar: "aaa" }, nick: "Ali", roles: ["role-a"] },
  { user: { id: "100000000000000002", username: "bob", global_name: null, avatar: null }, nick: null, roles: [] },
  { user: { id: "100000000000000009", username: "beep", bot: true, avatar: null }, nick: null, roles: [] },
];

beforeAll(async () => {
  await seedDevelopmentDatabase();
  const database = await getDatabase();
  await database.update(workspaces).set({ discordBotToken: "test-bot-token", discordGuildIdentifier: guild, slug: "workspace" });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes(`/guilds/${guild}/members`)) {
      return Response.json(roster);
    }
    if (url.endsWith(`/guilds/${guild}/roles`)) {
      return Response.json(guildRoles);
    }
    if (url.endsWith(`/guilds/${guild}`)) {
      return Response.json(profile);
    }
    throw new Error(`Unexpected fetch ${url}`);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("Discord guild sync", () => {
  test("mirrors the server name, icon and members", async () => {
    const database = await getDatabase();
    const first = await syncDiscordGuild();
    expect(first).toMatchObject({ name: "PLUS", added: 2, updated: 0, left: 0, total: 2, sweepRefusal: null });

    const mirrored = (await database.query.workspaces.findFirst())!;
    expect(mirrored.discordSyncedAt).not.toBeNull();
    expect(mirrored.discordSyncError).toBeNull();

    // The workspace takes the server's identity; the slug follows only while it is the placeholder.
    const workspace = await getWorkspace();
    expect(workspace.name).toBe("PLUS");
    expect(workspace.iconUrl).toBe(`https://cdn.discordapp.com/icons/${guild}/abc123.png?size=128`);
    expect(workspace.slug).toBe("plus");

    const alice = await database.query.users.findFirst({ where: eq(users.discordUserIdentifier, "100000000000000001") });
    expect(alice?.name).toBe("Ali");
    expect(alice?.email).toBe(placeholderEmail("100000000000000001"));
    expect(alice?.discordRoleIdentifiers).toEqual(["role-a"]);
    expect(alice?.image).toBe("https://cdn.discordapp.com/avatars/100000000000000001/aaa.png?size=64");
    expect((await listMembers()).find((member) => member.identifier === alice?.id)?.image).toBe(alice?.image);
    expect(alice?.displayName).toBe("alice");
  });

  test("follows a member's Discord username when they change it", async () => {
    const database = await getDatabase();
    const previousRoster = roster;
    const alice = previousRoster[0]!;
    roster = previousRoster.map((entry) =>
      entry.user.id === alice.user.id ? { ...entry, user: { ...entry.user, username: "Alice_The.Second!" } } : entry,
    );
    try {
      await syncDiscordGuild();
      const renamed = await database.query.users.findFirst({ where: eq(users.discordUserIdentifier, alice.user.id) });
      expect(renamed?.displayName).toBe("alice_the.second");
    } finally {
      roster = previousRoster;
      // Put the handle back, so the shared database is as the tests after this one
      // expect to find it.
      await syncDiscordGuild();
    }
  });

  test("keeps a chosen slug, prefers server avatars, and flags people who left", async () => {
    const database = await getDatabase();
    await database.update(workspaces).set({ slug: "chosen" });
    const bob = (await database.query.users.findFirst({ where: eq(users.discordUserIdentifier, "100000000000000002") }))!;
    await database.insert(sessions).values({ userId: bob.id, token: "bob-session", expiresAt: new Date(Date.now() + 60_000) });

    profile = { ...profile, name: "PLUS POSTECH", icon: null };
    roster = [{ ...roster[0]!, nick: "Alice K.", avatar: "guildpic" }, roster[2]!];
    const second = await syncDiscordGuild();
    expect(second).toMatchObject({ name: "PLUS POSTECH", added: 0, updated: 1, left: 1, total: 1 });

    const workspace = await getWorkspace();
    expect(workspace).toMatchObject({ name: "PLUS POSTECH", iconUrl: null, slug: "chosen" });

    const alice = (await database.query.users.findFirst({ where: eq(users.discordUserIdentifier, "100000000000000001") }))!;
    expect(alice.name).toBe("Alice K.");
    // A server-specific avatar wins over the account's global one.
    expect(alice.image).toBe(`https://cdn.discordapp.com/guilds/${guild}/users/100000000000000001/avatars/guildpic.png?size=64`);

    const bobAfter = (await database.query.users.findFirst({ where: eq(users.id, bob.id) }))!;
    expect(bobAfter.leftGuildAt).not.toBeNull();
    // Somebody who left keeps the name they had; `hasLeft` is what takes them
    // out of every picker, so the name stays in the record of what they did.
    expect(toUserSummary(bobAfter)).toMatchObject({ name: bobAfter.name, hasLeft: true });
    expect((await listMembers()).some((member) => member.identifier === bob.id)).toBe(false);
    expect(await database.query.sessions.findFirst({ where: eq(sessions.token, "bob-session") })).toBeUndefined();
  });

  /**
   * An API token opens every programmatic entry point in a departed member's name,
   * so it goes with their session. A reminder does not: it posts the workspace's
   * issue into the workspace's channel, and `created_by_identifier` is attribution.
   */
  test("revokes the API tokens of a member who left, and keeps the reminders they set up", async () => {
    const database = await getDatabase();
    const previousRoster = roster;
    roster = [
      ...previousRoster,
      { user: { id: "100000000000000003", username: "casey", global_name: "Casey", avatar: null }, nick: null, roles: [] },
    ];
    await syncDiscordGuild();
    const departing = (await database.query.users.findFirst({ where: eq(users.discordUserIdentifier, "100000000000000003") }))!;
    expect(departing.leftGuildAt).toBeNull();

    const token = await generateApiToken();
    await database.insert(apiTokens).values({
      userIdentifier: departing.id,
      name: "left in their pocket",
      tokenHash: token.hash,
      tokenPrefix: token.prefix,
    });
    const workspace = (await database.query.workspaces.findFirst())!;
    const [webhook] = await database
      .insert(discordWebhooks)
      .values({
        workspaceIdentifier: workspace.identifier,
        name: "#sweep",
        url: "https://discord.com/api/webhooks/333333333333333333/sweep-token",
      })
      .returning({ identifier: discordWebhooks.identifier });
    const issue = (await database.query.issues.findFirst())!;
    await database.insert(issueReminders).values({
      issueIdentifier: issue.identifier,
      webhookIdentifier: webhook!.identifier,
      leadMinutes: 1_440,
      repeatEveryMinutes: null,
      timeOfDay: "09:00",
      createdByIdentifier: departing.id,
    });

    roster = previousRoster;
    try {
      await syncDiscordGuild();
      expect((await database.query.users.findFirst({ where: eq(users.id, departing.id) }))?.leftGuildAt).not.toBeNull();
      expect(await database.query.apiTokens.findMany({ where: eq(apiTokens.userIdentifier, departing.id) })).toHaveLength(0);
      expect(
        await database.query.issueReminders.findMany({ where: eq(issueReminders.createdByIdentifier, departing.id) }),
      ).toHaveLength(1);
    } finally {
      // The suite shares one database, so this member goes back out rather than being
      // left for the tests that pick any member who is not an admin.
      await database.delete(discordWebhooks).where(eq(discordWebhooks.identifier, webhook!.identifier));
      await database.delete(users).where(eq(users.id, departing.id));
    }
  });

  /**
   * `and()` drops an undefined predicate, so an empty roster would leave
   * `left_guild_at is null` as the whole sweep condition: every member flagged as
   * departed and every session deleted, from one 200 with an empty body.
   */
  test("refuses to sweep on an empty member listing", async () => {
    const database = await getDatabase();
    const alice = (await database.query.users.findFirst({ where: eq(users.discordUserIdentifier, "100000000000000001") }))!;
    await database.insert(sessions).values({ userId: alice.id, token: "alice-session", expiresAt: new Date(Date.now() + 60_000) });
    const before = await database.query.users.findMany({ columns: { id: true, leftGuildAt: true } });
    const present = before.filter((row) => row.leftGuildAt === null).length;
    expect(present).toBeGreaterThan(0);

    const previousRoster = roster;
    // Only the bot is listed, which the member listing filters out — the same empty
    // collection Discord returns when the read fails.
    const botsOnly = previousRoster.filter((entry) => entry.user.bot === true);
    expect(botsOnly).toHaveLength(1);
    roster = botsOnly;
    try {
      const swept = await syncDiscordGuild();
      expect(swept).toMatchObject({ added: 0, updated: 0, left: 0, total: 0 });
      // Reported, not swallowed: everyone it read was updated, so a caller
      // that only counts those is told a clean sync happened.
      expect(swept.sweepRefusal).toContain("the listing came back empty");
      expect((await database.query.workspaces.findFirst())?.discordSyncError).toContain("Nobody was marked as having left");
    } finally {
      roster = previousRoster;
    }

    const after = await database.query.users.findMany({ columns: { id: true, leftGuildAt: true } });
    expect(after.filter((row) => row.leftGuildAt === null).length).toBe(present);
    expect(await database.query.sessions.findFirst({ where: eq(sessions.token, "alice-session") })).toBeDefined();
    await database.delete(sessions).where(eq(sessions.token, "alice-session"));
  });

  /**
   * Pagination stops as soon as a page comes back shorter than the page size, so a
   * truncated read is indistinguishable from "that is everyone" — and everybody it
   * leaves out looks exactly like somebody who left.
   */
  test("refuses to sweep on a listing that lost most of the roster", async () => {
    const database = await getDatabase();
    const previousRoster = roster;
    const joiners: RosterEntry[] = [
      { user: { id: "100000000000000004", username: "dana", global_name: "Dana", avatar: null }, nick: null, roles: [] },
      { user: { id: "100000000000000005", username: "erin", global_name: "Erin", avatar: null }, nick: null, roles: [] },
    ];
    const joinerIdentifiers = joiners.map((joiner) => joiner.user.id);
    roster = [...previousRoster, ...joiners];
    await syncDiscordGuild();
    const joined = await database.query.users.findMany({
      where: inArray(users.discordUserIdentifier, joinerIdentifiers),
      columns: { id: true },
    });
    expect(joined).toHaveLength(2);
    await database
      .insert(sessions)
      .values({ userId: joined[0]!.id, token: "dana-session", expiresAt: new Date(Date.now() + 60_000) });

    try {
      // Discord answers with one of the three members it listed a moment ago.
      roster = previousRoster;
      expect(await syncDiscordGuild()).toMatchObject({ left: 0, total: 1 });
      const after = await database.query.users.findMany({
        where: inArray(users.discordUserIdentifier, joinerIdentifiers),
        columns: { leftGuildAt: true },
      });
      expect(after.filter((row) => row.leftGuildAt === null)).toHaveLength(2);
      expect(await database.query.sessions.findFirst({ where: eq(sessions.token, "dana-session") })).toBeDefined();
    } finally {
      roster = previousRoster;
      await database.delete(users).where(inArray(users.discordUserIdentifier, joinerIdentifiers));
    }
  });

  /**
   * A member described in a way the schema does not accept is skipped, but what is
   * left is not the whole server afterwards: the member it skipped is exactly as
   * missing from it as somebody who walked out.
   */
  test("skips a member it cannot read without reading the gap as a departure", async () => {
    const database = await getDatabase();
    const previousRoster = roster;
    const alice = previousRoster[0]!;
    const newcomer: RosterEntry = {
      user: { id: "100000000000000006", username: "frank", global_name: "Frank", avatar: null },
      nick: null,
      roles: [],
    };
    roster = [{ ...alice, roles: "everything" as unknown as string[] }, newcomer];
    try {
      const result = await syncDiscordGuild();
      expect(result.added).toBe(1);
      expect(
        (await database.query.users.findFirst({ where: eq(users.discordUserIdentifier, newcomer.user.id) }))?.name,
      ).toBe("Frank");
      expect(result.left).toBe(0);
      expect(
        (await database.query.users.findFirst({ where: eq(users.discordUserIdentifier, alice.user.id) }))?.leftGuildAt,
      ).toBeNull();
    } finally {
      roster = previousRoster;
      await database.delete(users).where(eq(users.discordUserIdentifier, newcomer.user.id));
    }
  });

  test("leaves members who were never in the server alone", async () => {
    const database = await getDatabase();
    const workspace = (await database.query.workspaces.findFirst())!;
    const [handmade] = await database
      .insert(users)
      .values({
        workspaceIdentifier: workspace.identifier,
        name: "Handmade Person",
        displayName: "handmade",
        email: "handmade@acme.dev",
        avatarColor: "#eb5757",
      })
      .returning({ id: users.id });
    try {
      await syncDiscordGuild();
      const stored = (await database.query.users.findFirst({ where: eq(users.id, handmade!.id) }))!;
      expect(stored.leftGuildAt).toBeNull();
    } finally {
      await database.delete(users).where(eq(users.id, handmade!.id));
    }
  });

  test("mirrors who the server considers an admin", async () => {
    const database = await getDatabase();
    const workspace = (await database.query.workspaces.findFirst())!;
    expect(workspace.discordOwnerIdentifier).toBe("100000000000000001");
    expect(workspace.discordAdministratorRoleIdentifiers).toEqual(["role-super"]);

    const policy = await loadAdminPolicy();
    const alice = (await database.query.users.findFirst({ where: eq(users.discordUserIdentifier, "100000000000000001") }))!;
    expect(adminReasonOf(alice, policy)).toBe("owner");
    expect(adminReasonOf({ ...alice, discordUserIdentifier: "999", discordRoleIdentifiers: ["role-super"] }, policy)).toBe(
      "administrator_role",
    );
    expect(adminReasonOf({ ...alice, discordUserIdentifier: "999", discordRoleIdentifiers: ["role-a"] }, policy)).toBeNull();

    await database.update(workspaces).set({ adminRoleIdentifiers: ["role-a"] });
    const widened = await loadAdminPolicy();
    expect(adminReasonOf({ ...alice, discordUserIdentifier: "999", discordRoleIdentifiers: ["role-a"] }, widened)).toBe("admin_role");
    await database.update(workspaces).set({ adminRoleIdentifiers: [] });
  });

  test("links a synced member to their account on first sign-in", async () => {
    const database = await getDatabase();
    const alice = (await database.query.users.findFirst({ where: eq(users.discordUserIdentifier, "100000000000000001") }))!;

    await linkSyncedMember(database, { id: "100000000000000001", email: "Alice@Example.com", verified: true });
    const linked = (await database.query.users.findFirst({ where: eq(users.id, alice.id) }))!;
    expect(linked.email).toBe("alice@example.com");
    expect(await database.query.accounts.findFirst({ where: eq(accounts.userId, alice.id) })).toMatchObject({
      providerId: "discord",
      accountId: "100000000000000001",
    });
    await linkSyncedMember(database, { id: "100000000000000001", email: "alice@example.com", verified: true });
    expect((await database.query.accounts.findMany({ where: eq(accounts.userId, alice.id) })).length).toBe(1);

    await database.update(workspaces).set({ discordBotToken: null });
  });

  test("explains a refused member listing with the Server Members Intent message", async () => {
    const database = await getDatabase();
    await database.update(workspaces).set({ discordBotToken: "test-bot-token" });
    const stubbedFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) =>
      String(input).includes(`/guilds/${guild}/members`)
        ? new Response('{"message": "Missing Access", "code": 50001}', { status: 403 })
        : stubbedFetch(input)) as typeof fetch;
    try {
      await expect(syncDiscordGuild()).rejects.toThrow(
        "Discord refused to list server members. Enable “Server Members Intent” for the bot (Developer Portal › Bot › Privileged Gateway Intents) and make sure the bot is in the server.",
      );

      // The pass that failed never reached the sweep, so everybody who left in the
      // meantime keeps their session, their API tokens and whatever admin their roles
      // carried.
      const broken = (await database.query.workspaces.findFirst())!;
      expect(broken.discordSyncError).toContain("Server Members Intent");
      expect(broken.discordSyncedAt).not.toBeNull();
    } finally {
      globalThis.fetch = stubbedFetch;
      await database.update(workspaces).set({ discordBotToken: null });
    }
  });
});
