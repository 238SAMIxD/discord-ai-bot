import { Events } from "discord.js";
import { REST, Routes } from "discord.js";
import { getCommands } from "../commands/commands.js";
import { log, logError, LogLevel } from "../utils/logger.js";
import { getConfig } from "../config.js";
import type { Event } from "./index.js";

const event: Event<Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    const rest = new REST({ version: "10" }).setToken(getConfig().token);
    try {
      await client.guilds.fetch();
    } catch (error) {
      logError(error);
      log.log(
        LogLevel.Error,
        "Failed to fetch guilds; slash commands may not register correctly.",
      );
    }
    if (!client.user) return;
    client.user.setPresence({ activities: [], status: "online" });

    log.log(LogLevel.Info, `Bot is ready! Logged in as ${client.user.tag}`);

    try {
      await rest.put(Routes.applicationCommands(client.user.id), {
        body: getCommands().map((c) => c.data),
      });
      log.log(
        LogLevel.Info,
        "Successfully reloaded application slash (/) commands.",
      );
    } catch (error) {
      log.log(
        LogLevel.Error,
        "Failed to reload application slash (/) commands.",
        error,
      );
    }
  },
};

export default event;
