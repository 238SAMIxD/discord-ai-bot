import { Events, MessageFlags } from "discord.js";
import { logError } from "../utils/logger.js";
import type { Event } from "./index.js";
import { getCommands } from "../commands/commands.js";
import { getConfig } from "../config.js";

const event: Event<Events.InteractionCreate> = {
  name: Events.InteractionCreate,
  once: false,
  async execute(interaction) {
    const config = getConfig();
    if (config.channels.length === 0) {
      if (interaction.inGuild()) {
        return;
      }
    } else if (!config.channels.includes(interaction.channelId ?? "")) {
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = getCommands().find(
        (c) => c.data.name === interaction.commandName,
      );
      if (!command) return;

      try {
        if (command.autocomplete) {
          await command.autocomplete(interaction);
        }
      } catch (error) {
        logError(error);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = getCommands().find(
      (c) => c.data.name === interaction.commandName,
    );
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      logError(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: "There was an error while executing this command!",
        });
      } else {
        await interaction.reply({
          content: "There was an error while executing this command!",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};

export default event;
