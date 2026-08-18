import { ForbiddenError } from "@/lib/errors";

import { getCurrentUser, type CurrentUser } from "./current-user";

/**
 * Every export of a `"use server"` module carries one, and
 * `tests/server-actions.test.ts` fails the build if a new action forgets.
 */
export const callerPolicy = Symbol.for("tasks.callerPolicy");

type CallerPolicy = "member" | "admin" | "anyone";

type Guarded<Args extends readonly unknown[], Result> = ((...args: Args) => Promise<Result>) & {
  readonly [callerPolicy]: CallerPolicy;
};

/**
 * Server actions are HTTP endpoints and nothing upstream authenticates them, so
 * the actor is resolved before the body runs rather than inside it: an action
 * that merely *reads* the current user is only safe by accident.
 */
export const action = <Args extends readonly unknown[], Result>(
  body: (actor: CurrentUser, ...args: Args) => Promise<Result>,
): Guarded<Args, Result> =>
  Object.assign(async (...args: Args): Promise<Result> => body(await getCurrentUser(), ...args), {
    [callerPolicy]: "member" as const,
  });

/**
 * For actions that administer the workspace itself — its labels, workflow,
 * settings, members and webhooks — rather than the work inside it.
 */
export const adminAction = <Args extends readonly unknown[], Result>(
  body: (actor: CurrentUser, ...args: Args) => Promise<Result>,
): Guarded<Args, Result> =>
  Object.assign(
    async (...args: Args): Promise<Result> => {
      const actor = await getCurrentUser();
      if (!actor.isAdmin) {
        throw new ForbiddenError("Only admins can change workspace settings.");
      }
      return body(actor, ...args);
    },
    { [callerPolicy]: "admin" as const },
  );

/**
 * A server action anyone may call. Rare by design: use it only where being
 * signed out is part of the feature, and say why at the call site.
 */
export const publicAction = <Args extends readonly unknown[], Result>(
  body: (...args: Args) => Promise<Result>,
): Guarded<Args, Result> =>
  Object.assign(async (...args: Args): Promise<Result> => body(...args), {
    [callerPolicy]: "anyone" as const,
  });
