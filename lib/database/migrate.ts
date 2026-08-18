/**
 * Migrates whether or not the app is configured to migrate on start.
 *
 * Usage: `bun run db:migrate`
 */
import { openDatabase } from "./client";
import { resolveDatabaseConfiguration } from "./configuration";

const handle = await openDatabase({ ...resolveDatabaseConfiguration(), migrateOnStart: true });
console.info(
  `[database] Migrations applied using the ${handle.configuration.driver} driver.`,
);
await handle.close();
