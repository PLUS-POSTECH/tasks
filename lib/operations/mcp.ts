import { InvalidInputError } from "@/lib/errors";
import { getWorkspace } from "@/lib/workspace/queries";

import { listOperations, runOperation } from "./registry";

/**
 * Model Context Protocol adapter over JSON-RPC 2.0 (Streamable HTTP,
 * stateless): the same operation catalog as the HTTP API, run as the token's
 * owner.
 */

const serverName = "tasks";
const serverVersion = "1.0.0";
const latestProtocolVersion = "2025-06-18";
const supportedProtocolVersions = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
const unauthenticatedCode = -32001;

/** Tool names may only contain letters, digits, `_` and `-`, so `issues.list` becomes `issues_list`. */
export const toolNameOf = (operationName: string): string => operationName.replace(/\./g, "_");

const mcpTools = listOperations().map((operation) => ({
  name: toolNameOf(operation.name),
  description: operation.description,
  inputSchema: operation.inputSchema,
  annotations: { readOnlyHint: operation.readOnly, destructiveHint: !operation.readOnly },
}));

const operationNameByToolName = new Map<string, string>(
  listOperations().map((operation) => [toolNameOf(operation.name), operation.name]),
);

type JsonRpcIdentifier = string | number | null;

type JsonRpcMessage = {
  readonly jsonrpc?: string;
  readonly id?: JsonRpcIdentifier;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  readonly jsonrpc: "2.0";
  readonly id: JsonRpcIdentifier;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string; readonly data?: unknown };
};

const success = (id: JsonRpcIdentifier, result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });

const failure = (id: JsonRpcIdentifier, code: number, message: string, data?: unknown): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message, ...(data === undefined ? {} : { data }) },
});

/** Tool failures are reported as content so the model can read and react to them. */
const toolFailure = (message: string, details?: unknown) => ({
  content: [{ type: "text", text: details === undefined ? message : `${message}\n${JSON.stringify(details, null, 2)}` }],
  isError: true,
});

const toolSuccess = (value: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(value ?? null, null, 2) }],
  ...(value !== null && typeof value === "object" && !Array.isArray(value) ? { structuredContent: value } : {}),
});

const callTool = async (params: Record<string, unknown> | undefined) => {
  const toolName = typeof params?.name === "string" ? params.name : "";
  const operationName = operationNameByToolName.get(toolName);
  if (!operationName) {
    return toolFailure(`Unknown tool "${toolName}".`);
  }
  try {
    return toolSuccess(await runOperation(operationName, params?.arguments ?? {}));
  } catch (error) {
    return toolFailure(
      error instanceof Error ? error.message : "The operation failed.",
      error instanceof InvalidInputError ? error.issues : undefined,
    );
  }
};

const dispatch = async (message: JsonRpcMessage): Promise<JsonRpcResponse | null> => {
  const id = message.id ?? null;
  const isNotification = message.id === undefined;
  switch (message.method) {
    case "initialize": {
      const requested = message.params?.protocolVersion;
      const protocolVersion =
        typeof requested === "string" && supportedProtocolVersions.some((version) => version === requested)
          ? requested
          : latestProtocolVersion;
      const workspace = await getWorkspace();
      return success(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: serverName, title: `${workspace.name} tasks`, version: serverVersion },
        instructions:
          "Issue tracker for this workspace. Read with the *_list and *_get tools before changing anything; issues are addressed by reference such as \"#12\".",
      });
    }
    case "ping":
      return success(id, {});
    case "tools/list":
      return success(id, { tools: mcpTools });
    case "tools/call":
      return success(id, await callTool(message.params));
    default:
      // Notifications (initialized, cancelled, …) need no reply.
      return isNotification ? null : failure(id, -32601, `Method "${message.method ?? ""}" is not supported.`);
  }
};

/**
 * The one failure reported as a protocol error with a challenge rather than as
 * tool content. -32001 is in the implementation-defined server range.
 */
export const unauthorizedResponse = (message: string): Response =>
  Response.json(failure(null, unauthenticatedCode, message), {
    status: 401,
    headers: { "www-authenticate": 'Bearer realm="tasks"' },
  });

/** Returns 202 when the body held only notifications, as the protocol expects. */
export const handleMcpMessages = async (body: unknown): Promise<Response> => {
  const messages = Array.isArray(body) ? body : [body];
  if (messages.length === 0 || messages.some((message) => typeof message !== "object" || message === null)) {
    return Response.json(failure(null, -32600, "Expected a JSON-RPC 2.0 message."), { status: 400 });
  }
  const responses: JsonRpcResponse[] = [];
  for (const message of messages as JsonRpcMessage[]) {
    const response = await dispatch(message);
    if (response) {
      responses.push(response);
    }
  }
  if (responses.length === 0) {
    return new Response(null, { status: 202 });
  }
  return Response.json(Array.isArray(body) ? responses : responses[0]);
};
