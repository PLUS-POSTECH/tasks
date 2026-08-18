import { beforeAll, describe, expect, test } from "bun:test";

import { seedDevelopmentDatabase } from "@/lib/database/development";
import { handleMcpMessages, toolNameOf } from "@/lib/operations/mcp";
import { listOperations } from "@/lib/operations/registry";
import { getCurrentUser } from "@/lib/session/current-user";
import { listAllMembers, listMembers } from "@/lib/users/queries";

import { actingAs, signedInTest } from "./act-as";

type McpTool = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: { readonly readOnlyHint: boolean };
};

type ToolResult = {
  readonly content: readonly { readonly type: string; readonly text: string }[];
  readonly isError?: boolean;
  readonly structuredContent?: Record<string, never>;
};

type RpcResponse<Result> = {
  readonly id: number | null;
  readonly result?: Result;
  readonly error?: { readonly code: number; readonly message: string };
};

const rpc = async <Result>(message: unknown): Promise<{ status: number; body: RpcResponse<Result> }> => {
  const response = await handleMcpMessages(message);
  return { status: response.status, body: response.status === 202 ? { id: null } : await response.json() };
};

const callTool = async (name: string, toolArguments?: unknown): Promise<ToolResult> => {
  const { body } = await rpc<ToolResult>({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: toolArguments } });
  if (!body.result) {
    throw new Error(`tools/call returned no result: ${JSON.stringify(body.error)}`);
  }
  return body.result;
};

beforeAll(async () => {
  await seedDevelopmentDatabase();
});

describe("MCP endpoint", () => {
  test("negotiates the protocol version", async () => {
    const supported = await rpc<{ protocolVersion: string; serverInfo: { name: string } }>({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26" },
    });
    expect(supported.body.result).toMatchObject({ protocolVersion: "2025-03-26", serverInfo: { name: "tasks" } });
    const unknown = await rpc<{ protocolVersion: string }>({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } });
    expect(unknown.body.result?.protocolVersion).toBe("2025-06-18");
  });

  test("advertises every operation as a callable tool", async () => {
    const { body } = await rpc<{ tools: readonly McpTool[] }>({ jsonrpc: "2.0", id: 3, method: "tools/list" });
    const tools = body.result?.tools ?? [];
    expect(tools.length).toBe(listOperations().length);
    // Clients reject names with dots, so the catalog's `issues.create` is exposed as `issues_create`.
    expect(tools.every((tool) => /^[a-zA-Z0-9_-]{1,64}$/.test(tool.name))).toBe(true);
    const create = tools.find((tool) => tool.name === toolNameOf("issues.create"));
    expect(create?.inputSchema).toMatchObject({
      type: "object",
      required: ["title"],
      properties: { reporterIdentifier: { type: "string", format: "uuid" } },
    });
    expect(tools.find((tool) => tool.name === toolNameOf("issues.update"))?.inputSchema).toMatchObject({
      properties: { reporterIdentifier: { type: "string", format: "uuid" } },
    });
    expect(create?.annotations.readOnlyHint).toBe(false);
    expect(tools.find((tool) => tool.name === "issues_list")?.annotations.readOnlyHint).toBe(true);
    // Catalog text names things, never other operations, so no transport has to rewrite it.
    expect(JSON.stringify(tools)).not.toContain("workspace.webhooks");
  });

  signedInTest("runs operations and reports failures as tool content", async () => {
    const actor = await getCurrentUser();
    const reporter = (await listMembers()).find((member) => member.identifier !== actor.identifier);
    if (!reporter) {
      throw new Error("Reporter fixture missing.");
    }
    const nextReporter = (await listMembers()).find(
      (member) => member.identifier !== actor.identifier && member.identifier !== reporter.identifier,
    );
    if (!nextReporter) {
      throw new Error("Next reporter fixture missing.");
    }
    const created = await callTool("issues_create", {
      title: "Filed over MCP",
      priority: 1,
      reporterIdentifier: reporter.identifier,
    });
    expect(created.isError).toBeUndefined();
    const reference = String(created.structuredContent?.reference);
    expect(reference).toMatch(/^#\d+$/);
    expect(JSON.parse(created.content[0]?.text ?? "{}").reference).toBe(reference);

    const fetched = await callTool("issues_get", { reference });
    expect(JSON.parse(fetched.content[0]?.text ?? "{}")).toMatchObject({
      issue: { title: "Filed over MCP", creator: { identifier: reporter.identifier } },
      activities: [{ type: "created", actor: { identifier: actor.identifier } }],
      subscribers: [{ identifier: reporter.identifier }],
    });

    const updated = await callTool("issues_update", {
      reference,
      reporterIdentifier: nextReporter.identifier,
    });
    expect(updated.isError).toBeUndefined();
    expect(JSON.parse(updated.content[0]?.text ?? "{}")).toMatchObject({
      creator: { identifier: nextReporter.identifier },
    });

    const refetched = await callTool("issues_get", { reference });
    const refetchedDetail = JSON.parse(refetched.content[0]?.text ?? "{}");
    expect(refetchedDetail.activities).toEqual(
      expect.arrayContaining([
        {
          type: "reporter_changed",
          actor: expect.objectContaining({ identifier: actor.identifier }),
          payload: {
            fromReporterIdentifier: reporter.identifier,
            fromReporterName: reporter.name,
            toReporterIdentifier: nextReporter.identifier,
            toReporterName: nextReporter.name,
          },
          identifier: expect.any(String),
          createdAt: expect.any(String),
        },
      ]),
    );
    expect(refetchedDetail.subscribers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ identifier: reporter.identifier }),
        expect.objectContaining({ identifier: nextReporter.identifier }),
      ]),
    );

    // Invalid input and unknown tools stay inside the tool result, not the JSON-RPC envelope.
    const invalid = await callTool("issues_create", { title: "" });
    expect(invalid.isError).toBe(true);
    expect(invalid.content[0]?.text).toContain("Invalid input");
    expect((await callTool("nope")).isError).toBe(true);
  });

  signedInTest("restricts reporting on another member's behalf to admins", async () => {
    const [actor, reporter] = (await listAllMembers()).filter((member) => !member.isAdmin && !member.hasLeft);
    if (!actor || !reporter) {
      throw new Error("Ordinary member fixtures missing.");
    }
    const forbidden = await actingAs(actor.identifier, () =>
      callTool("issues_create", {
        title: "Spoofed reporter",
        reporterIdentifier: reporter.identifier,
      }),
    );
    expect(forbidden.isError).toBe(true);
    expect(forbidden.content[0]?.text).toContain("Only admins can select another issue reporter");

    const created = await actingAs(actor.identifier, () =>
      callTool("issues_create", { title: "Reporter update permission" }),
    );
    const reference = String(created.structuredContent?.reference);
    const forbiddenUpdate = await actingAs(actor.identifier, () =>
      callTool("issues_update", { reference, reporterIdentifier: reporter.identifier }),
    );
    expect(forbiddenUpdate.isError).toBe(true);
    expect(forbiddenUpdate.content[0]?.text).toContain("Only admins can change issue reporters");

    const missing = await callTool("issues_create", {
      title: "Missing reporter",
      reporterIdentifier: "00000000-0000-4000-8000-000000000000",
    });
    expect(missing.isError).toBe(true);
    expect(missing.content[0]?.text).toContain("Reporter not found");

    const updateTarget = await callTool("issues_create", { title: "Missing update reporter" });
    const missingUpdate = await callTool("issues_update", {
      reference: String(updateTarget.structuredContent?.reference),
      reporterIdentifier: "00000000-0000-4000-8000-000000000000",
    });
    expect(missingUpdate.isError).toBe(true);
    expect(missingUpdate.content[0]?.text).toContain("Reporter not found");
  });

  test("answers pings, ignores notifications and rejects unknown methods", async () => {
    expect((await rpc<Record<string, never>>({ jsonrpc: "2.0", id: 4, method: "ping" })).body.result).toEqual({});
    expect((await rpc({ jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
    expect((await rpc({ jsonrpc: "2.0", id: 5, method: "resources/list" })).body.error?.code).toBe(-32601);
    expect((await rpc("not a message")).status).toBe(400);
  });

  test("answers batches in kind", async () => {
    const response = await handleMcpMessages([
      { jsonrpc: "2.0", id: 6, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 7, method: "tools/list" },
    ]);
    const responses = (await response.json()) as readonly RpcResponse<unknown>[];
    expect(responses.map((entry) => entry.id)).toEqual([6, 7]);
  });
});
