import { createHash } from "node:crypto";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { getDatabase, type Database } from "@/lib/database/client";
import { accounts, sessions, users, verifications } from "@/lib/database/schema";

import { authorizeDiscordSignIn, completeNewMember, onSessionCreated, userFromDiscordProfile } from "./membership";
import { getAuthSettings, type AuthSettings } from "./settings";
import { trustedProxyRanges } from "./trusted-proxies";

/**
 * better-auth's default for `/sign-in*` is 3 per 10 seconds per client address,
 * which is a password-guessing budget: this app has no passwords, and a room
 * full of members onboarding shares one NAT address.
 */
const socialSignInRateLimit = { window: 60, max: 30 } as const;

const createAuth = (database: Database, settings: AuthSettings) =>
  betterAuth({
    ...(settings.baseUrl ? { baseURL: settings.baseUrl, trustedOrigins: [settings.baseUrl] } : {}),
    secret: settings.secret,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: { users, sessions, accounts, verifications },
    }),
    advanced: {
      database: { generateId: "uuid" },
      /**
       * Naming the proxy's ranges is what lets better-auth walk
       * `x-forwarded-for` to the first hop it did not put there; without it a
       * forged chain is rejected wholesale and rate limiting collapses onto
       * one bucket everybody shares.
       */
      ipAddress: { trustedProxies: [...trustedProxyRanges()] },
      /**
       * A different setting from the one above: this decides whether
       * `x-forwarded-host` and `x-forwarded-proto` may *name the deployment*
       * when `baseURL` is not configured, so a deployment that has not been
       * through `/setup` would take its identity from whoever asked. The
       * library defaults it on.
       */
      trustedProxyHeaders: false,
    },
    rateLimit: {
      customRules: {
        "/sign-in/social": socialSignInRateLimit,
      },
    },
    user: {
      modelName: "users",
      // better-auth validates required fields before the create hook runs, so
      // these are optional here; `completeNewMember` always fills them in.
      additionalFields: {
        workspaceIdentifier: { type: "string", required: false, input: false },
        displayName: { type: "string", required: false, input: false },
        avatarColor: { type: "string", required: false, input: false },
        isAdmin: { type: "boolean", required: false, input: false, defaultValue: false },
      },
    },
    session: { modelName: "sessions" },
    account: { modelName: "accounts" },
    verification: { modelName: "verifications" },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({ data: await completeNewMember(database, user) }),
        },
      },
      session: {
        create: {
          before: async (session) => {
            await onSessionCreated(database, session.userId);
            return { data: session };
          },
        },
      },
    },
    socialProviders: {
      discord: {
        clientId: settings.discordClientIdentifier ?? "",
        clientSecret: settings.discordClientSecret ?? "",
        scope: ["guilds"],
        getUserInfo: async (token) => {
          if (!token.accessToken) {
            return null;
          }
          const profile = await authorizeDiscordSignIn(database, settings, token.accessToken);
          if (!profile?.email) {
            return null;
          }
          return { user: userFromDiscordProfile({ ...profile, email: profile.email }), data: profile };
        },
      },
    },
    plugins: [nextCookies()],
  });

export type Auth = ReturnType<typeof createAuth>;

type CachedAuth = { readonly signature: string; readonly auth: Auth };

const globalAuthStore = globalThis as typeof globalThis & { __tasksAuth?: CachedAuth };

/**
 * The tuple includes the session secret and the Discord client secret, and
 * `globalThis` outlives the request that put it there, so it is hashed rather
 * than parked in plaintext where a heap dump or a log line could reach it.
 */
const settingsSignature = (settings: AuthSettings): string =>
  createHash("sha256")
    .update(
      JSON.stringify([
        settings.baseUrl,
        settings.secret,
        settings.discordClientIdentifier,
        settings.discordClientSecret,
        settings.discordGuildIdentifier,
      ]),
    )
    .digest("hex");

/** Settings are re-read on every call, so edits take effect without a restart. */
export const getAuth = async (): Promise<Auth> => {
  const [database, settings] = await Promise.all([getDatabase(), getAuthSettings()]);
  const signature = settingsSignature(settings);
  if (globalAuthStore.__tasksAuth?.signature === signature) {
    return globalAuthStore.__tasksAuth.auth;
  }
  const auth = createAuth(database, settings);
  globalAuthStore.__tasksAuth = { signature, auth };
  return auth;
};
