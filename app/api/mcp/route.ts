import { handleMcpMessages, unauthorizedResponse } from "@/lib/operations/mcp";
import { runAsActor } from "@/lib/session/actor-context";
import { requireActor } from "@/lib/session/request-actor";

export const POST = async (request: Request): Promise<Response> => {
  const resolution = await requireActor(request);
  if (resolution.outcome === "unauthenticated") {
    return unauthorizedResponse(resolution.message);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Body must be JSON." } }, { status: 400 });
  }
  return runAsActor(resolution.actor, () => handleMcpMessages(body));
};

/** Both are optional in the protocol, and clients are required to accept 405 here. */
export const GET = (): Response =>
  Response.json(
    { jsonrpc: "2.0", id: null, error: { code: -32000, message: "This endpoint only accepts POST." } },
    { status: 405, headers: { allow: "POST" } },
  );

export const DELETE = GET;
