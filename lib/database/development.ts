import { asc, eq } from "drizzle-orm";

import { discordBotOf, loadAuthSettings } from "@/lib/auth/settings";
import { syncDiscordGuild } from "@/lib/discord/sync";

import { getDatabaseHandle, type Database } from "./client";
import { isDevelopmentEnvironment } from "./configuration";
import { discordWebhooks, users, workspaces } from "./schema";
import { seedSampleData, seedSampleMembers, seedWorkspace } from "./seed";

/**
 * Local-development bootstrap for the embedded database. Secrets are copied
 * from `.env.development.local` into the workspace row rather than living in
 * the committed seed, and stay editable from the settings UI afterwards.
 */

const developmentSecrets = () => ({
  discordClientSecret: process.env.SEED_DISCORD_CLIENT_SECRET?.trim() || null,
  discordBotToken: process.env.SEED_DISCORD_BOT_TOKEN?.trim() || null,
  webhookUrl: process.env.SEED_DISCORD_WEBHOOK_URL?.trim() || null,
  adminRoleIdentifiers: (process.env.SEED_DISCORD_ADMIN_ROLE_IDS ?? "")
    .split(",")
    .map((identifier) => identifier.trim())
    .filter((identifier) => identifier.length > 0),
});

const ensureDevelopmentWebhook = async (database: Database, workspaceIdentifier: string, url: string | null): Promise<void> => {
  if (!url || (await database.query.discordWebhooks.findFirst({ columns: { identifier: true } }))) {
    return;
  }
  console.info("[database] Registering the development Discord webhook from .env.development.local.");
  await database.insert(discordWebhooks).values({ workspaceIdentifier, name: "#dev", url });
};

const applyDevelopmentSecrets = async (database: Database): Promise<void> => {
  const secrets = developmentSecrets();
  const workspace = await database.query.workspaces.findFirst({
    columns: { identifier: true, discordClientSecret: true, discordBotToken: true, adminRoleIdentifiers: true },
  });
  if (!workspace) {
    return;
  }
  await ensureDevelopmentWebhook(database, workspace.identifier, secrets.webhookUrl);
  const patch = {
    ...(workspace.discordClientSecret === null && secrets.discordClientSecret ? { discordClientSecret: secrets.discordClientSecret } : {}),
    ...(workspace.discordBotToken === null && secrets.discordBotToken ? { discordBotToken: secrets.discordBotToken } : {}),
    ...(workspace.adminRoleIdentifiers.length === 0 && secrets.adminRoleIdentifiers.length > 0
      ? { adminRoleIdentifiers: secrets.adminRoleIdentifiers }
      : {}),
  };
  if (Object.keys(patch).length > 0) {
    console.info(`[database] Applying development secrets from .env.development.local: ${Object.keys(patch).join(", ")}.`);
    await database.update(workspaces).set(patch).where(eq(workspaces.identifier, workspace.identifier));
  }
};

/**
 * Real Discord members whenever the server can be reached, so a development
 * database looks like production; the invented team is a fallback for clones
 * without credentials, and for tests, which never talk to Discord.
 */
const seedMembers = async (database: Database, workspaceIdentifier: string): Promise<readonly string[]> => {
  if (discordBotOf(await loadAuthSettings())) {
    try {
      const guild = await syncDiscordGuild();
      const members = await database.query.users.findMany({ columns: { id: true }, orderBy: [asc(users.name)] });
      if (members.length > 0) {
        console.info(`[database] Seeding sample issues across the ${guild.total} members of “${guild.name}”.`);
        return members.map((member) => member.id);
      }
    } catch (error) {
      console.warn("[database] Could not read the Discord server; using the sample team instead.", error);
    }
  }
  return seedSampleMembers(database, workspaceIdentifier);
};

/**
 * Called only from development entry points, and it checks anyway: a deployment
 * that reached this would be writing fixtures into real data.
 */
export const seedDevelopmentDatabase = async (): Promise<boolean> => {
  const handle = await getDatabaseHandle();
  if (!isDevelopmentEnvironment() || handle.configuration.driver !== "pglite") {
    return false;
  }
  return bootstrapDevelopmentDatabase(handle.database);
};

const bootstrapDevelopmentDatabase = async (database: Database): Promise<boolean> => {
  const existing = await database.query.workspaces.findFirst({ columns: { identifier: true } });
  const workspaceIdentifier = existing?.identifier ?? (await seedWorkspace(database));
  // Secrets are applied before seeding so the Discord server can be mirrored.
  await applyDevelopmentSecrets(database);
  if (existing) {
    return false;
  }
  console.info("[database] Empty development database detected; seeding sample data.");
  await seedSampleData(database, workspaceIdentifier, await seedMembers(database, workspaceIdentifier));
  return true;
};
