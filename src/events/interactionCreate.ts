import { Events, MessageFlags } from "discord.js";
import { logError } from "../utils/logger.js";
import type { Event } from "./index.js";
import { getCommands } from "../commands/commands.js";
import { isChannelAllowed } from "../utils/channels.js";
import { replyWithStats, STATS_BUTTON_PREFIX } from "../utils/stats.js";

const event: Event<Events.InteractionCreate> = {
  name: Events.InteractionCreate,
  once: false,
  async execute(interaction) {
    if (interaction.isAutocomplete()) {
      const command = getCommands().find(
        (c) => c.data.name === interaction.commandName,
      );
      if (!command) return;

      try {
        if (!(await isChannelAllowed(interaction))) {
          await interaction.respond([]);
        } else if (command.autocomplete) {
          await command.autocomplete(interaction);
        }
      } catch (error) {
        logError(error);
      }
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith(STATS_BUTTON_PREFIX)) {
        try {
          await replyWithStats(interaction);
        } catch (error) {
          logError(error);
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = getCommands().find(
      (c) => c.data.name === interaction.commandName,
    );
    if (!command) return;

    if (!(await isChannelAllowed(interaction))) {
      try {
        await interaction.reply({
          content: "This bot isn't enabled in this channel.",
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        logError(error);
      }
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      logError(error);
      const content = "There was an error while executing this command!";
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content });
        } else {
          await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        }
      } catch (replyError) {
        logError(replyError);
      }
    }
  },
};

export default event;
