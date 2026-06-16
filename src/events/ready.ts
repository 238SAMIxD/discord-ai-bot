import { Events } from "discord.js";
import { REST, Routes } from "discord.js";
import commands from "../commands/commands.js";
import { log, logError } from "../utils/logger.js";
import { LogLevel } from "../types.js";
import { config } from "../config.js";
import type { Event } from "./index.js";

const event: Event<Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    const rest = new REST({ version: "10" }).setToken(config.token);
    try {
      await client.guilds.fetch();
    } catch (error) {
      logError(error);
      log.log(
        LogLevel.Error,
        "Failed to fetch guilds; slash commands may not register correctly.",
      );
    }
    client.user!.setPresence({ activities: [], status: "online" });
    try {
      await rest.put(Routes.applicationCommands(client.user!.id), {
        body: commands.map((c) => c.data),
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
