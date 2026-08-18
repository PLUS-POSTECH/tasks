/**
 * Discord blocks generic runtime user agents, so every request identifies the
 * app. Every Discord call goes through the one transport below, so anything
 * Discord did not accept becomes a `DiscordApiError` quoting its response body.
 */

const discordApiBase = "https://discord.com/api/v10";

const discordUserAgent = "Tasks (+https://github.com/PLUS-POSTECH/tasks, 1.0)";

/** Budget for a single Discord call; requests state their own only with a reason. */
const defaultTimeoutMilliseconds = 10_000;

const errorBodyCharacterLimit = 200;

export type DiscordCredential = { readonly bearer: string } | { readonly bot: string } | { readonly none: true };

const authorizationHeader = (credential: DiscordCredential): Record<string, string> =>
  "bearer" in credential
    ? { authorization: `Bearer ${credential.bearer}` }
    : "bot" in credential
      ? { authorization: `Bot ${credential.bot}` }
      : {};

export class DiscordApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    body: string,
    /**
     * How long Discord asked to be left alone, or null when it did not say. A
     * 429 always says, and a caller that retries has to honour it.
     */
    readonly retryAfterMilliseconds: number | null = null,
  ) {
    super(`Discord API ${path} responded with ${status}${body ? `: ${body}` : "."}`);
  }
}

/** Discord states `retry-after` in seconds, sometimes fractional. */
const retryAfterMillisecondsOf = (response: Response): number | null => {
  const header = response.headers.get("retry-after");
  if (header === null) {
    return null;
  }
  const seconds = Number.parseFloat(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
};

export type DiscordRequest = {
  /** A path under the Discord API base, or an absolute Discord URL. */
  readonly url: string;
  readonly credential: DiscordCredential;
  readonly method?: "GET" | "POST";
  readonly body?: unknown;
  /** Replaces the shared budget; say at the call site why this endpoint needs longer. */
  readonly timeoutMilliseconds?: number;
  readonly endpointName?: string;
};

type DiscordOutcome =
  | { readonly accepted: true; readonly response: Response }
  | { readonly accepted: false; readonly failure: DiscordApiError };

const attemptDiscordRequest = async (request: DiscordRequest): Promise<DiscordOutcome> => {
  const response = await fetch(request.url.startsWith("https://") ? request.url : `${discordApiBase}${request.url}`, {
    method: request.method ?? "GET",
    headers: {
      "user-agent": discordUserAgent,
      ...authorizationHeader(request.credential),
      ...(request.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
    signal: AbortSignal.timeout(request.timeoutMilliseconds ?? defaultTimeoutMilliseconds),
  });
  return response.ok
    ? { accepted: true, response }
    : {
        accepted: false,
        failure: new DiscordApiError(
          response.status,
          request.endpointName ?? request.url,
          (await response.text().catch(() => "")).slice(0, errorBodyCharacterLimit),
          retryAfterMillisecondsOf(response),
        ),
      };
};

export const discordRequest = async (request: DiscordRequest): Promise<Response> => {
  const outcome = await attemptDiscordRequest(request);
  if (!outcome.accepted) {
    throw outcome.failure;
  }
  return outcome.response;
};

export const discordJson = async (request: DiscordRequest): Promise<unknown> => (await discordRequest(request)).json();

export type DiscordJsonResource = { readonly present: true; readonly json: unknown } | { readonly present: false };

/** Discord's 404 is an answer here rather than a failure, so callers never see a status. */
export const discordJsonIfPresent = async (request: DiscordRequest): Promise<DiscordJsonResource> => {
  const outcome = await attemptDiscordRequest(request);
  if (!outcome.accepted) {
    if (outcome.failure.status === 404) {
      return { present: false };
    }
    throw outcome.failure;
  }
  return { present: true, json: await outcome.response.json() };
};
