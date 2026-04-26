import { Events } from "discord.js";
import { REST, Routes } from "discord.js";
import commands from "../commands/commands.js";
import { log } from "../utils/logger.js";
import { LogLevel } from "../types.js";
import { config } from "../config.js";
import type { Event } from "./index.js";

const event: Event<Events.ClientReady> = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		const rest = new REST({ version: "10" }).setToken(config.token);
		await client.guilds.fetch();
		client.user!.setPresence({ activities: [], status: "online" });
		try {
			await rest.put(Routes.applicationCommands(client.user!.id), {
				body: commands
			});
			log.log(LogLevel.Info, "Successfully reloaded application slash (/) commands.");
		} catch (error) {
			log.log(LogLevel.Error, "Failed to reload application slash (/) commands.", error);
		}
	}
};

export default event;
