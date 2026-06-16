import { Events, MessageFlags } from "discord.js";
import { logError } from "../utils/logger.js";
import type { Event } from "./index.js";
import commands from "../commands/commands.js";

const event: Event<Events.InteractionCreate> = {
  name: Events.InteractionCreate,
  once: false,
  async execute(interaction) {
    if (interaction.isAutocomplete()) {
      const command = commands.find(
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

    const command = commands.find(
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
