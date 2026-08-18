/**
 * Refuses to touch a real PostgreSQL server, so production data is never mixed
 * with fixtures.
 *
 * Usage: `bun run db:seed` (or `bun run db:reset` to start from scratch)
 */
import { getDatabaseHandle } from "./client";
import { resolveDatabaseConfiguration } from "./configuration";
import { seedDevelopmentDatabase } from "./development";

const configuration = resolveDatabaseConfiguration();
if (configuration.driver !== "pglite") {
  throw new Error(
    "Refusing to seed a non-embedded database. Point DATABASE_URL at a pglite:// directory.",
  );
}

const seeded = await seedDevelopmentDatabase();
const handle = await getDatabaseHandle();
console.info(
  seeded
    ? "[database] Seeded the development database."
    : "[database] Development database already contains data; nothing to seed. Run `bun run db:reset` to start over.",
);
await handle.close();
