import { unauthorizedResponse } from "@/lib/operations/http";
import { listOperations } from "@/lib/operations/registry";
import { requireActor } from "@/lib/session/request-actor";

export const GET = async (request: Request): Promise<Response> => {
  const resolution = await requireActor(request);
  if (resolution.outcome === "unauthenticated") {
    return unauthorizedResponse(resolution.message);
  }
  return Response.json({ operations: listOperations() });
};
