import {
  ForbiddenError,
  InvalidInputError,
  MembershipRequiredError,
  NotFoundError,
  UnknownOperationError,
} from "@/lib/errors";
import { runAsActor } from "@/lib/session/actor-context";
import { requireActor } from "@/lib/session/request-actor";

import { runOperation } from "./registry";

const jsonError = (status: number, error: string, details?: unknown): Response =>
  Response.json({ error, ...(details === undefined ? {} : { details }) }, { status });

/** This transport's vocabulary for a failed operation. Anything unrecognised is the caller's fault. */
const httpStatusOf = (error: unknown): 400 | 401 | 403 | 404 => {
  if (error instanceof UnknownOperationError || error instanceof NotFoundError) {
    return 404;
  }
  if (error instanceof MembershipRequiredError) {
    return 401;
  }
  if (error instanceof ForbiddenError) {
    return 403;
  }
  return 400;
};

const failureResponse = (error: unknown): Response =>
  jsonError(
    httpStatusOf(error),
    error instanceof Error ? error.message : "Operation failed.",
    error instanceof InvalidInputError ? error.issues : undefined,
  );

/** The operations API answers an unauthenticated request with the same body shape as any other failure. */
export const unauthorizedResponse = (message: string): Response => jsonError(401, message);

export const handleOperationRequest = async (request: Request, name: string, input: unknown): Promise<Response> => {
  const resolution = await requireActor(request);
  if (resolution.outcome === "unauthenticated") {
    return unauthorizedResponse(resolution.message);
  }
  try {
    const result = await runAsActor(resolution.actor, () => runOperation(name, input));
    return Response.json({ result: result ?? null });
  } catch (error) {
    return failureResponse(error);
  }
};
