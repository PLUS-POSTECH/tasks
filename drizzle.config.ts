import { defineConfig } from "drizzle-kit";

import { migrationsDirectory, resolveDatabaseConfiguration } from "./lib/database/configuration";

const databaseConfiguration = resolveDatabaseConfiguration();

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/database/schema/index.ts",
  out: migrationsDirectory,
  ...(databaseConfiguration.driver === "pglite"
    ? {
        driver: "pglite",
        dbCredentials: { url: databaseConfiguration.dataDirectory },
      }
    : { dbCredentials: { url: databaseConfiguration.connectionString } }),
  strict: true,
  verbose: true,
});
