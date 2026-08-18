/**
 * Production masks thrown server-action errors, so an action whose message
 * matters (a call to Discord, a sync) returns this instead of throwing.
 */
export type ActionResult<T = undefined> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

export const attempt = async <T>(work: () => Promise<T>, fallback = "Something went wrong."): Promise<ActionResult<T>> => {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : fallback };
  }
};
