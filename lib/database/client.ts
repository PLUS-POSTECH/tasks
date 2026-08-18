import { mkdir } from "node:fs/promises";

import { sql, type ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";

import {
  migrationsFolder,
  resolveDatabaseConfiguration,
  type DatabaseConfiguration,
} from "./configuration";
import * as schema from "./schema";

export type DatabaseSchema = typeof schema;

export type Database = PgDatabase<
  PgQueryResultHKT,
  DatabaseSchema,
  ExtractTablesWithRelations<DatabaseSchema>
>;

/**
 * The drivers are loaded at runtime rather than bundled: PGlite ships a
 * WebAssembly build that must be resolved from `node_modules`, and
 * `turbopackIgnore` keeps Turbopack from rewriting these into hashed externals.
 */
const loadPglite = () => import(/* turbopackIgnore: true */ "@electric-sql/pglite");
const loadPostgres = () => import(/* turbopackIgnore: true */ "postgres");

export type DatabaseHandle = {
  readonly database: Database;
  readonly configuration: DatabaseConfiguration;
  readonly close: () => Promise<void>;
};

/**
 * Serialises migrations across instances starting at once: the second waits,
 * then finds nothing to apply instead of failing on half-created tables.
 */
const migrationLockKey = 8_162_026;


const migratePostgresExclusively = async (database: Parameters<typeof migratePostgres>[0]): Promise<void> => {
  await database.execute(sql`select pg_advisory_lock(${migrationLockKey})`);
  try {
    await migratePostgres(database, { migrationsFolder });
  } finally {
    await database.execute(sql`select pg_advisory_unlock(${migrationLockKey})`);
  }
};

export const openDatabase = async (
  configuration: DatabaseConfiguration,
): Promise<DatabaseHandle> => {
  if (configuration.driver === "pglite") {
    await mkdir(configuration.dataDirectory, { recursive: true });
    const { PGlite } = await loadPglite();
    const client = new PGlite(configuration.dataDirectory);
    await client.waitReady;
    // PGlite's Emscripten runtime leaves `process.exitCode` at 99 after boot
    // under Bun, which would make every CLI script and test run report failure.
    if (process.exitCode === 99) {
      process.exitCode = 0;
    }
    const database = drizzlePglite({ client, schema });
    if (configuration.migrateOnStart) {
      await migratePglite(database, { migrationsFolder });
    }
    return {
      database,
      configuration,
      close: () => client.close(),
    };
  }

  const { default: postgres } = await loadPostgres();
  const client = postgres(configuration.connectionString, {
    connect_timeout: 10,
    idle_timeout: 30,
    // "relation already exists, skipping" from the migrator's CREATE IF NOT EXISTS is noise.
    onnotice: () => undefined,
  });
  const database = drizzlePostgres({ client, schema });
  if (configuration.migrateOnStart) {
    await migratePostgresExclusively(database);
  }
  return {
    database,
    configuration,
    close: () => client.end(),
  };
};

/**
 * Cached on `globalThis` so hot reloading reuses one embedded PostgreSQL
 * instance instead of opening the same data directory repeatedly.
 */
const globalHandleStore = globalThis as typeof globalThis & {
  __tasksDatabaseHandle?: Promise<DatabaseHandle>;
};

export const getDatabaseHandle = (): Promise<DatabaseHandle> => {
  if (!globalHandleStore.__tasksDatabaseHandle) {
    globalHandleStore.__tasksDatabaseHandle = openDatabase(resolveDatabaseConfiguration());
    globalHandleStore.__tasksDatabaseHandle.catch(() => {
      globalHandleStore.__tasksDatabaseHandle = undefined;
    });
  }
  return globalHandleStore.__tasksDatabaseHandle;
};

export const getDatabase = async (): Promise<Database> =>
  (await getDatabaseHandle()).database;
