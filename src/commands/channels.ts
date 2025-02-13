import { CommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";

import { CHANNELS } from "../bot";
import commands from "./commands";

async function channels() {
  return {
    command: new SlashCommandBuilder()
      .setName("channels")
      .setDescription("Check channels in which the bot is active"),
    handler: handleChannels,
  };

  async function handleChannels(interaction: CommandInteraction) {
    if (CHANNELS.length === 0) {
      await interaction.reply({
        content: "Bot is available in all channels.",
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: `Bot is available in the following channels: ${CHANNELS.map(channel => `<#${channel}>`).join(", ")}`,
      ephemeral: true,
    });
  }
}

export default channels;
