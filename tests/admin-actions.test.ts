import { beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";

import { hasAnyAdmin } from "@/lib/auth/admin";
import { updateAuthSettings } from "@/lib/auth/actions";
import { isAuthConfigured, loadAuthSettings } from "@/lib/auth/settings";
import { completeNewMember } from "@/lib/auth/membership";
import { getDatabase } from "@/lib/database/client";
import { seedDevelopmentDatabase } from "@/lib/database/development";
import { users, workspaces } from "@/lib/database/schema";
import { ForbiddenError } from "@/lib/errors";
import { classifyDueDate } from "@/lib/formatting/dates";
import { createIssue } from "@/lib/issues/actions";
import { createLabel } from "@/lib/labels/actions";
import { listLabels } from "@/lib/labels/queries";
import { removeMember, setAdminRoles, setMemberAdmin, updateOwnProfile, updateWorkspace } from "@/lib/settings/actions";
import { listAllMembers } from "@/lib/users/queries";
import { createWorkflowState, deleteWorkflowState, updateWorkflowState } from "@/lib/workflow/actions";
import { listStates } from "@/lib/workflow/queries";
import { getWorkspace } from "@/lib/workspace/queries";

import { actingAs, signedInTest } from "./act-as";

beforeAll(async () => {
  await seedDevelopmentDatabase();
});

describe("workspace administration", () => {
  signedInTest("a member who is not an admin cannot change the workspace", async () => {
    const members = await listAllMembers();
    const member = members.find((candidate) => !candidate.isAdmin);
    expect(member).toBeDefined();

    const workspace = await getWorkspace();
    const states = await listStates();
    await actingAs(member!.identifier, async () => {
      for (const attempt of [
        () => updateWorkspace({ slug: "hijacked", timezone: workspace.timezone }),
        () => setMemberAdmin(member!.identifier, true),
        () => setAdminRoles(["123456789012345678"]),
        () => removeMember(members.find((candidate) => candidate.identifier !== member!.identifier)!.identifier),
        () => deleteWorkflowState(states[0]!.identifier, states[1]!.identifier),
      ]) {
        await expect(attempt()).rejects.toThrow(ForbiddenError);
      }
    });

    expect((await getWorkspace()).slug).toBe(workspace.slug);
    expect((await listStates()).length).toBe(states.length);
  });

  // The line is credentials, privilege and mass rewrites — not the vocabulary
  // people use to organise their own work.
  signedInTest("everything a member needs to organise work stays open to them", async () => {
    const member = (await listAllMembers()).find((candidate) => !candidate.isAdmin);
    await actingAs(member!.identifier, async () => {
      const label = await createLabel({ name: "Member-made label" });
      expect((await listLabels()).some((entry) => entry.name === "Member-made label")).toBe(true);
      await createWorkflowState({ name: "Member-made state", type: "unstarted", color: "#ff0000" });
      expect((await listStates()).some((state) => state.name === "Member-made state")).toBe(true);
      const issue = await createIssue({ title: "Ordinary work still works" });
      expect(issue.reference).toBeTruthy();
      await updateOwnProfile({
        name: member!.name,
        displayName: member!.displayName,
        email: (member!.administered ? member!.email : null) ?? "member@example.com",
        avatarColor: member!.avatarColor,
      });
      expect(label.identifier).toBeTruthy();
    });
  });

  /**
   * The Discord sync writes a member's name and their `@handle` on every pass, so
   * saving either here would be undone within ten minutes while the form said it
   * had worked. Their e-mail address and avatar colour are not in the roster.
   */
  signedInTest("refuses the profile fields Discord owns while a server is mirrored", async () => {
    const database = await getDatabase();
    const workspace = (await database.query.workspaces.findFirst())!;
    const member = (await listAllMembers()).find((candidate) => !candidate.isAdmin)!;
    const before = (await database.query.users.findFirst({ where: eq(users.id, member.identifier) }))!;
    const claim = { name: "Renamed By Hand", displayName: "renamed-by-hand" } as const;
    try {
      await database
        .update(workspaces)
        .set({ discordBotToken: "a-bot-token", discordGuildIdentifier: "100000000000000000" });
      await actingAs(member.identifier, () =>
        updateOwnProfile({ ...claim, email: before.email, avatarColor: "#27ae60" }),
      );
      const mirrored = (await database.query.users.findFirst({ where: eq(users.id, member.identifier) }))!;
      expect(mirrored.name).toBe(before.name);
      expect(mirrored.displayName).toBe(before.displayName);
      expect(mirrored.avatarColor).toBe("#27ae60");

      await database.update(workspaces).set({ discordBotToken: null, discordGuildIdentifier: null });
      await actingAs(member.identifier, () =>
        updateOwnProfile({ ...claim, email: before.email, avatarColor: before.avatarColor }),
      );
      const ownProfile = (await database.query.users.findFirst({ where: eq(users.id, member.identifier) }))!;
      expect(ownProfile.name).toBe(claim.name);
      expect(ownProfile.displayName).toBe(claim.displayName);
    } finally {
      await database
        .update(users)
        .set({ name: before.name, displayName: before.displayName, avatarColor: before.avatarColor })
        .where(eq(users.id, before.id));
      await database.update(workspaces).set({
        discordBotToken: workspace.discordBotToken,
        discordGuildIdentifier: workspace.discordGuildIdentifier,
      });
    }
  });

  /**
   * `/settings/members` is readable by every member, and the whole list is in
   * its payload: `canManage` only decides which buttons render, so what the
   * payload carries is what has been handed over.
   */
  signedInTest("the roster carries e-mail addresses and admin reasons for admins only", async () => {
    const asAdmin = await listAllMembers();
    const knownEmails = asAdmin.flatMap((member) => ("email" in member && member.email ? [member.email] : []));
    expect(knownEmails.length).toBeGreaterThan(0);
    expect(asAdmin.every((member) => "adminReason" in member)).toBe(true);

    const plainMember = asAdmin.find((member) => !member.isAdmin);
    expect(plainMember).toBeDefined();
    const asMember = await actingAs(plainMember!.identifier, () => listAllMembers());

    expect(asMember).toHaveLength(asAdmin.length);
    expect(asMember.some((member) => member.isAdmin)).toBe(true);
    expect(asMember.some((member) => "email" in member || "adminReason" in member)).toBe(false);
    const payload = JSON.stringify(asMember);
    expect(knownEmails.some((email) => payload.includes(email))).toBe(false);
  });

  signedInTest("an admin can do the rest", async () => {
    const admin = (await listAllMembers()).find((candidate) => candidate.isAdmin);
    expect(admin).toBeDefined();
    await actingAs(admin!.identifier, async () => {
      const workspace = await getWorkspace();
      await updateWorkspace({ slug: workspace.slug, timezone: workspace.timezone });
      const states = await listStates();
      const doomed = states.find((state) => state.name === "Member-made state")!;
      await deleteWorkflowState(doomed.identifier, states.find((state) => state.identifier !== doomed.identifier)!.identifier);
      expect((await listStates()).some((state) => state.identifier === doomed.identifier)).toBe(false);
    });
  });
});

describe("the workspace's time zone", () => {
  /**
   * The container runs UTC while the club is in Seoul, so for the nine hours after
   * midnight there the two disagree about what day it is — long enough for every
   * issue due today to render as not yet due.
   */
  signedInTest("decides what day a due date is judged against", async () => {
    const database = await getDatabase();
    const workspace = await getWorkspace();
    const earlyMorningInSeoul = new Date("2026-08-17T22:00:00Z");
    try {
      await database.update(workspaces).set({ timezone: "Asia/Seoul" });
      expect(classifyDueDate("2026-08-18", (await getWorkspace()).timezone, earlyMorningInSeoul)).toBe("today");

      await database.update(workspaces).set({ timezone: "UTC" });
      expect(classifyDueDate("2026-08-18", (await getWorkspace()).timezone, earlyMorningInSeoul)).toBe("soon");
    } finally {
      await database.update(workspaces).set({ timezone: workspace.timezone });
    }
  });
});

describe("becoming an admin", () => {
  // Otherwise whoever reaches a fresh deployment before its owner owns it.
  test("is not something signing in can do", async () => {
    const database = await getDatabase();
    const created = await completeNewMember(database, { email: "newcomer@example.com" });
    expect("isAdmin" in created).toBe(false);
  });

  signedInTest("closes the setup form once anybody is one", async () => {
    expect(await hasAnyAdmin()).toBe(true);
    const member = (await listAllMembers()).find((candidate) => !candidate.isAdmin);
    await actingAs(member!.identifier, async () => {
      await expect(
        updateAuthSettings({
          baseUrl: "https://hijacked.example.com",
          discordClientIdentifier: "100000000000000000",
          discordClientSecret: "",
          discordGuildIdentifier: "",
          discordBotToken: "",
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });
});

describe("a fresh workspace", () => {
  // `issues.state_identifier` is NOT NULL, so a workspace with no workflow cannot
  // take its first issue.
  signedInTest("comes with a workflow, so the very first issue can be created", async () => {
    const states = await listStates();
    expect(states.map((state) => state.name)).toEqual([
      "Backlog",
      "Todo",
      "In Progress",
      "In Review",
      "Done",
      "Canceled",
      "Duplicate",
    ]);
    const admin = (await listAllMembers()).find((candidate) => candidate.isAdmin);
    await actingAs(admin!.identifier, async () => {
      const issue = await createIssue({ title: "First issue of a fresh workspace" });
      expect(issue.reference).toBeTruthy();
    });
  });
});

describe("a deployment nobody administers yet", () => {
  /**
   * Runs `body` against a workspace put back to a fresh deployment, and restores
   * everything afterwards: the suite shares one database, and a workspace left
   * pointing at an invented server strands the rest.
   */
  const asAFreshDeployment = async (body: () => Promise<void>): Promise<void> => {
    const database = await getDatabase();
    const workspace = (await database.query.workspaces.findFirst())!;
    const grantedAdmins = (await database.query.users.findMany({ columns: { id: true, isAdmin: true } }))
      .filter((candidate) => candidate.isAdmin)
      .map((candidate) => candidate.id);
    await database.update(users).set({ isAdmin: false });
    await database.update(workspaces).set({
      discordOwnerIdentifier: null,
      discordAdministratorRoleIdentifiers: [],
      adminRoleIdentifiers: [],
      authBaseUrl: null,
      discordClientIdentifier: null,
      discordClientSecret: null,
      discordGuildIdentifier: null,
      discordBotToken: null,
    });
    try {
      await body();
    } finally {
      if (grantedAdmins.length > 0) {
        await database.update(users).set({ isAdmin: true }).where(inArray(users.id, grantedAdmins));
      }
      await database
        .update(workspaces)
        .set({
          name: workspace.name,
          slug: workspace.slug,
          iconUrl: workspace.iconUrl,
          discordOwnerIdentifier: workspace.discordOwnerIdentifier,
          discordAdministratorRoleIdentifiers: workspace.discordAdministratorRoleIdentifiers,
          adminRoleIdentifiers: workspace.adminRoleIdentifiers,
          authBaseUrl: workspace.authBaseUrl,
          discordClientIdentifier: workspace.discordClientIdentifier,
          discordClientSecret: workspace.discordClientSecret,
          discordGuildIdentifier: workspace.discordGuildIdentifier,
          discordBotToken: workspace.discordBotToken,
        })
        .where(eq(workspaces.identifier, workspace.identifier));
    }
  };

  const setupGuild = "100000000000000001";

  /**
   * Every route to being an admin needs the Discord sync to have read the server,
   * and the sync needs a bot token — so a first save without one leaves nobody who
   * can ever be an admin, and `updateAuthSettings` public to anonymous callers.
   */
  test("cannot finish setup without a bot token, which is what would leave the form open forever", async () => {
    await asAFreshDeployment(async () => {
      expect(await hasAnyAdmin()).toBe(false);
      await expect(
        updateAuthSettings({
          baseUrl: "https://unclaimed.example.com",
          discordClientIdentifier: "100000000000000000",
          discordClientSecret: "a-client-secret",
          discordGuildIdentifier: setupGuild,
          discordBotToken: "",
        }),
      ).rejects.toThrow("A Discord server ID and bot token are required to finish setup");
      expect(isAuthConfigured(await loadAuthSettings())).toBe(false);
    });
  });

  /**
   * `/setup` stops rendering the moment sign-in is configured, admin or not, so
   * the action behind it has to close on the same condition — otherwise an
   * anonymous caller could repoint the workspace at a Discord server of their own.
   */
  test("closes the setup action as soon as sign-in is configured, admin or not", async () => {
    await asAFreshDeployment(async () => {
      const database = await getDatabase();
      await database.update(workspaces).set({
        authBaseUrl: "https://claimed.example.com",
        discordClientIdentifier: "100000000000000000",
        discordClientSecret: "a-client-secret",
      });
      expect(await hasAnyAdmin()).toBe(false);
      expect(isAuthConfigured(await loadAuthSettings())).toBe(true);

      // Signed out, which is what an anonymous caller of a server action is.
      await expect(
        updateAuthSettings({
          baseUrl: "https://hijacked.example.com",
          discordClientIdentifier: "100000000000000002",
          discordClientSecret: "their-client-secret",
          discordGuildIdentifier: "100000000000000003",
          discordBotToken: "their-bot-token",
        }),
      ).rejects.toThrow("Sign in to change authentication settings.");
      expect((await loadAuthSettings()).baseUrl).toBe("https://claimed.example.com");
    });
  });

  /**
   * A first save that configures sign-in without producing an admin would close
   * `/setup` on a deployment nobody can administer, so the sync is part of the
   * save and a save that could not read the server puts the settings back.
   */
  test("undoes a first save whose Discord read fails, so setup can be tried again", async () => {
    await asAFreshDeployment(async () => {
      const originalFetch = globalThis.fetch;
      // The server itself answers, but listing its members needs the Server Members
      // Intent, off by default — and that listing is what creates the rows admin is
      // read from.
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(`/guilds/${setupGuild}`)) {
          return Response.json({ id: setupGuild, name: "Intentless Guild", icon: null, owner_id: "900000000000000001" });
        }
        if (url.endsWith(`/guilds/${setupGuild}/roles`)) {
          return Response.json([]);
        }
        return new Response('{"message": "Missing Access", "code": 50001}', { status: 403 });
      }) as typeof fetch;
      try {
        await expect(
          updateAuthSettings({
            baseUrl: "https://half-configured.example.com",
            discordClientIdentifier: "100000000000000000",
            discordClientSecret: "a-client-secret",
            discordGuildIdentifier: setupGuild,
            discordBotToken: "a-bot-token",
          }),
        ).rejects.toThrow("Nothing was saved");
      } finally {
        globalThis.fetch = originalFetch;
      }
      const settings = await loadAuthSettings();
      expect(isAuthConfigured(settings)).toBe(false);
      expect(settings.discordBotToken).toBeNull();
      expect(await hasAnyAdmin()).toBe(false);
    });
  });
});

describe("what a status means", () => {
  // A status's type decides what counts as done, so changing one would move every
  // issue holding it at once: it is set at creation and never again. TypeScript
  // refuses the field; this is the runtime half, for a caller that is not TypeScript.
  signedInTest("cannot be changed after the status exists", async () => {
    const done = (await listStates()).find((state) => state.type === "completed")!;
    const admin = (await listAllMembers()).find((candidate) => candidate.isAdmin);

    await actingAs(admin!.identifier, async () => {
      await expect(
        (updateWorkflowState as (identifier: string, patch: unknown) => Promise<void>)(done.identifier, {
          type: "backlog",
        }),
      ).rejects.toThrow();
      expect((await listStates()).find((state) => state.identifier === done.identifier)?.type).toBe("completed");

      await updateWorkflowState(done.identifier, { name: "Shipped", color: done.color });
      expect((await listStates()).find((state) => state.identifier === done.identifier)?.name).toBe("Shipped");
      await updateWorkflowState(done.identifier, { name: done.name });
    });
  });
});
