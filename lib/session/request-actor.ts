import { bearerToken, resolveApiToken } from "@/lib/api-tokens/tokens";
import { MembershipRequiredError } from "@/lib/errors";
import { findMember } from "@/lib/session/current-user";

import type { ActorContext } from "./actor-context";

/**
 * The failure is returned rather than thrown because each transport writes its
 * own unauthorized response.
 */
export type ActorResolution =
  | { readonly outcome: "authenticated"; readonly actor: ActorContext }
  | { readonly outcome: "unauthenticated"; readonly message: string };

const unauthenticated: ActorResolution = {
  outcome: "unauthenticated",
  message: "Authentication required: send Authorization: Bearer <api token>.",
};

/**
 * Credentials naming somebody who is no longer a member get the same refusal as
 * no credentials at all: which of the two it was is not the caller's to learn.
 */
const membershipRequired: ActorResolution = {
  outcome: "unauthenticated",
  message: new MembershipRequiredError().message,
};

/**
 * A bearer API token and nothing else: a route handler, unlike a server action,
 * has no origin check of its own, so accepting the session cookie would make
 * the mutating catalog reachable with ambient credentials. A token also
 * outlives the membership it was issued under, so membership is settled here,
 * before any transport — or any handshake — answers anything.
 */
export const requireActor = async (request: Request): Promise<ActorResolution> => {
  const token = bearerToken(request);
  const actor = token === null ? null : await resolveApiToken(token);
  if (!actor) {
    return unauthenticated;
  }
  const member = await findMember(actor.userIdentifier);
  return member ? { outcome: "authenticated", actor } : membershipRequired;
};
