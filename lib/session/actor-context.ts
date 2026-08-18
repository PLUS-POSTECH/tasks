import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who is acting, independent of transport. `findCurrentUser` consults this
 * first and falls back to the better-auth cookie, so every action and query
 * works unchanged for every entry point; the web app sets no context of its own.
 */
export type ActorContext = {
  readonly userIdentifier: string;
  readonly via: "api-token" | "system";
  readonly tokenIdentifier?: string;
};

const storage = new AsyncLocalStorage<ActorContext>();

export const currentActorContext = (): ActorContext | undefined => storage.getStore();

export const runAsActor = <T>(actor: ActorContext, work: () => Promise<T>): Promise<T> => storage.run(actor, work);
