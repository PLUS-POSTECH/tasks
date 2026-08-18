import path from "node:path";

const developmentDataDirectory = "./.data/development";

export type DatabaseConfiguration = {
  readonly migrateOnStart: boolean;
} & (
  | { readonly driver: "pglite"; readonly dataDirectory: string }
  | { readonly driver: "postgres"; readonly connectionString: string }
);

/**
 * Resolved against the working directory because the app runs from a bundle
 * under `.next/server`, where a module-relative path would no longer find the
 * SQL files; the Docker image sets `WORKDIR /app` and copies `lib/` for this.
 */
export const migrationsDirectory = "./lib/database/migrations";
export const migrationsFolder = path.resolve(migrationsDirectory);

export type DatabaseEnvironment = {
  readonly DATABASE_URL?: string;
  readonly DATABASE_MIGRATE_ON_START?: string;
  readonly NODE_ENV?: string;
};

/**
 * Development covers `next dev`, the CLI scripts and the test runner —
 * everything except a real deployment.
 */
export const isDevelopmentEnvironment = (environment: DatabaseEnvironment = process.env): boolean =>
  environment.NODE_ENV !== "production";

/**
 * `pglite://<directory>` runs an embedded PostgreSQL in-process; `postgres://`
 * connects to a server. A deployment must say which one it means: falling back
 * to the embedded engine there would open an empty database inside the
 * container, with no volume behind it, and report healthy while every write
 * vanished on restart.
 */
export const resolveDatabaseConfiguration = (
  environment: DatabaseEnvironment = process.env,
): DatabaseConfiguration => {
  const databaseUrl = environment.DATABASE_URL?.trim();
  // Migrating on start is the default; a deploy pipeline that runs
  // `bun run db:migrate` itself can turn it off.
  const migrateOnStart = environment.DATABASE_MIGRATE_ON_START?.trim().toLowerCase() !== "false";

  if (!databaseUrl) {
    if (!isDevelopmentEnvironment(environment)) {
      throw new Error("DATABASE_URL is required outside development. Set it to a postgresql:// connection string.");
    }
    return { driver: "pglite", dataDirectory: developmentDataDirectory, migrateOnStart: true };
  }

  if (databaseUrl.startsWith("pglite://")) {
    // The embedded engine creates its data directory on demand, so there is
    // never an unmigrated database to protect.
    return { driver: "pglite", dataDirectory: databaseUrl.slice("pglite://".length), migrateOnStart: true };
  }

  if (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")) {
    return { driver: "postgres", connectionString: databaseUrl, migrateOnStart };
  }

  throw new Error(
    `Unsupported DATABASE_URL scheme. Expected "pglite://" or "postgresql://" but received "${databaseUrl.split("://")[0]}://".`,
  );
};
