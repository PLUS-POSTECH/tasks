import { syncDiscordGuild } from "@/lib/discord/sync";
import { discordBotOf, getAuthSettings } from "@/lib/auth/settings";
import { dispatchDueReminders } from "@/lib/reminders/dispatch";

import { startScheduler, type Job } from "./scheduler";

const minute = 60_000;

const reminderDispatch: Job = {
  name: "reminders",
  everyMilliseconds: minute,
  run: async () => {
    await dispatchDueReminders();
  },
};

const guildSync: Job = {
  name: "discord",
  everyMilliseconds: 10 * minute,
  run: async () => {
    if (discordBotOf(await getAuthSettings())) {
      await syncDiscordGuild();
    }
  },
};

export const startBackgroundJobs = (): void => startScheduler([reminderDispatch, guildSync]);
