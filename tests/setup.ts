import { afterAll, mock } from "bun:test";

mock.module("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
  headers: async () => new Headers(),
}));

/**
 * React's `cache` memoises per request; there is no request in tests, so it
 * would memoise forever and hide state changes made by earlier steps.
 */
const actualReact = await import("react");
mock.module("react", () => ({ ...actualReact, cache: <T>(fn: T): T => fn }));

mock.module("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

mock.module("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new Error(`redirect(${destination})`);
  },
  notFound: () => {
    throw new Error("notFound()");
  },
}));

/**
 * `@/lib/session/current-user` is deliberately *not* mocked: tests say who they
 * are through `tests/act-as.ts`, so the `leftGuildAt` cut-off, `requireActor`
 * and the bearer token path stay in the suite.
 */

process.env.DATABASE_URL = `pglite://./.data/test-${process.pid}`;
// Tests never talk to Discord, and the webhook in .env.development.local stays
// out of the fixtures.
process.env.SEED_DISCORD_BOT_TOKEN = "";
process.env.SEED_DISCORD_CLIENT_SECRET = "";
process.env.SEED_DISCORD_WEBHOOK_URL = "";

afterAll(async () => {
  const { rm } = await import("node:fs/promises");
  await rm(`./.data/test-${process.pid}`, { recursive: true, force: true });
});
