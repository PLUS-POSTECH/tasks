import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { POST as mcpRoute } from "@/app/api/mcp/route";
import { GET as operationCatalogRoute } from "@/app/api/operations/route";
import { generateApiToken, resolveApiToken } from "@/lib/api-tokens/tokens";
import { getDatabase } from "@/lib/database/client";
import { seedDevelopmentDatabase } from "@/lib/database/development";
import { apiTokens, users } from "@/lib/database/schema";
import { InvalidInputError, UnknownOperationError } from "@/lib/errors";
import { handleOperationRequest } from "@/lib/operations/http";
import { findOperation, listOperations, runOperation } from "@/lib/operations/registry";
import { getCurrentUser } from "@/lib/session/current-user";

import { signedInTest } from "./act-as";

beforeAll(async () => {
  await seedDevelopmentDatabase();
});

describe("operations catalog", () => {
  test("describes every operation with a JSON schema input", () => {
    const operations = listOperations();
    expect(operations.map((operation) => operation.name)).toContain("issues.create");
    const create = operations.find((operation) => operation.name === "issues.create")!;
    expect(create.readOnly).toBe(false);
    expect(create.inputSchema).toMatchObject({ type: "object", required: ["title"] });
    expect(new Set(operations.map((operation) => operation.name)).size).toBe(operations.length);
    // The catalog is static: descriptors are built once and looked up by name.
    expect(listOperations()).toBe(operations);
    expect(findOperation("issues.create")?.name).toBe("issues.create");
    expect(findOperation("nope.nothing")).toBeUndefined();
  });

  signedInTest("runs operations as the current actor and reports client faults", async () => {
    const me = await getCurrentUser();
    const workspace = (await runOperation("workspace.get", {})) as { actor: { identifier: string } };
    expect(workspace.actor.identifier).toBe(me.identifier);

    const created = (await runOperation("issues.create", { title: "Via operations", priority: 2 })) as { reference: string };
    const updated = (await runOperation("issues.update", { reference: created.reference, assigneeIdentifier: me.identifier, dueDate: "2030-01-02" })) as {
      assignee: { identifier: string } | null;
      dueDate: string | null;
    };
    expect(updated.assignee?.identifier).toBe(me.identifier);
    expect(updated.dueDate).toBe("2030-01-02");
    const detail = (await runOperation("issues.get", { reference: created.reference })) as { issue: { title: string } };
    expect(detail.issue.title).toBe("Via operations");

    // Domain errors, not statuses: `lib/operations/http.ts` answers these with 404 and 400.
    await expect(runOperation("nope.nothing", {})).rejects.toBeInstanceOf(UnknownOperationError);
    await expect(runOperation("issues.create", { title: "" })).rejects.toBeInstanceOf(InvalidInputError);
    await expect(runOperation("issues.create", { title: "" })).rejects.toMatchObject({
      message: "Invalid input.",
      issues: { properties: { title: { errors: expect.any(Array) } } },
    });
  });

  signedInTest("API tokens resolve to their owner until revoked", async () => {
    const me = await getCurrentUser();
    const database = await getDatabase();
    const generated = await generateApiToken();
    expect(generated.token.startsWith("tsk_")).toBe(true);
    await database.insert(apiTokens).values({ userIdentifier: me.identifier, name: "test", tokenHash: generated.hash, tokenPrefix: generated.prefix });
    expect(await resolveApiToken(generated.token)).toMatchObject({ userIdentifier: me.identifier, via: "api-token" });
    expect(await resolveApiToken("tsk_definitely-not-a-token")).toBeNull();
    expect(await resolveApiToken("Bearer nonsense")).toBeNull();
    await database.delete(apiTokens);
    expect(await resolveApiToken(generated.token)).toBeNull();
  });
});

describe("the operations API over HTTP", () => {
  const operationRequest = (token?: string): Request =>
    new Request("https://tasks.example.com/api/operations/workspace.get", {
      method: "POST",
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    });

  test("refuses a request that carries no credentials", async () => {
    const response = await handleOperationRequest(operationRequest(), "workspace.get", {});
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Authentication required") });
  });

  test("refuses a bearer token nothing issued", async () => {
    const response = await handleOperationRequest(operationRequest("tsk_not-a-real-token"), "workspace.get", {});
    expect(response.status).toBe(401);
  });

  /**
   * A token outlives the membership it was issued under, so revoking somebody's
   * Discord membership has to revoke their tokens with it. The token still
   * resolves — that is only who sent the request — and `requireActor` settles it.
   */
  test("refuses the token of a member who left the Discord server", async () => {
    const database = await getDatabase();
    const workspace = (await database.query.workspaces.findFirst())!;
    const [departed] = await database
      .insert(users)
      .values({
        workspaceIdentifier: workspace.identifier,
        name: "Departed Person",
        displayName: "departed",
        email: "departed@acme.dev",
        avatarColor: "#eb5757",
        discordUserIdentifier: "400000000000000001",
      })
      .returning({ identifier: users.id });
    const generated = await generateApiToken();
    await database.insert(apiTokens).values({
      userIdentifier: departed!.identifier,
      name: "still in their pocket",
      tokenHash: generated.hash,
      tokenPrefix: generated.prefix,
    });
    try {
      const allowed = await handleOperationRequest(operationRequest(generated.token), "workspace.get", {});
      expect(allowed.status).toBe(200);

      await database.update(users).set({ leftGuildAt: new Date() }).where(eq(users.id, departed!.identifier));
      const refused = await handleOperationRequest(operationRequest(generated.token), "workspace.get", {});
      expect(refused.status).toBe(401);
      expect(await refused.json()).toMatchObject({ error: "Authentication required." });
      expect(await resolveApiToken(generated.token)).toMatchObject({ userIdentifier: departed!.identifier });
    } finally {
      await database.delete(apiTokens).where(eq(apiTokens.userIdentifier, departed!.identifier));
      await database.delete(users).where(eq(users.id, departed!.identifier));
    }
  });
});

/**
 * Membership belongs where the actor is resolved, not only inside
 * `runOperation`: the operation catalog and MCP's `initialize`, `ping` and
 * `tools/list` handshake all answer before it gets that far.
 */
describe("the handshakes in front of the operations", () => {
  const bearer = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

  const catalogRequest = (token: string): Request =>
    new Request("https://tasks.example.com/api/operations", { headers: bearer(token) });

  const mcpRequest = (token: string, method: string): Request =>
    new Request("https://tasks.example.com/api/mcp", {
      method: "POST",
      headers: bearer(token),
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: {} }),
    });

  test("close to a departed member's token, not just the operations behind them", async () => {
    const database = await getDatabase();
    const workspace = (await database.query.workspaces.findFirst())!;
    const [holder] = await database
      .insert(users)
      .values({
        workspaceIdentifier: workspace.identifier,
        name: "Handshake Person",
        displayName: "handshake",
        email: "handshake@acme.dev",
        avatarColor: "#4ea7fc",
        discordUserIdentifier: "400000000000000002",
      })
      .returning({ identifier: users.id });
    const generated = await generateApiToken();
    await database.insert(apiTokens).values({
      userIdentifier: holder!.identifier,
      name: "handshake token",
      tokenHash: generated.hash,
      tokenPrefix: generated.prefix,
    });

    try {
      expect((await operationCatalogRoute(catalogRequest(generated.token))).status).toBe(200);
      expect((await mcpRoute(mcpRequest(generated.token, "tools/list"))).status).toBe(200);

      await database.update(users).set({ leftGuildAt: new Date() }).where(eq(users.id, holder!.identifier));

      const catalog = await operationCatalogRoute(catalogRequest(generated.token));
      expect(catalog.status).toBe(401);
      expect(await catalog.json()).toMatchObject({ error: "Authentication required." });

      for (const method of ["initialize", "ping", "tools/list"]) {
        const response = await mcpRoute(mcpRequest(generated.token, method));
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ error: { code: -32001 } });
      }
    } finally {
      await database.delete(apiTokens).where(eq(apiTokens.userIdentifier, holder!.identifier));
      await database.delete(users).where(eq(users.id, holder!.identifier));
    }
  });
});
