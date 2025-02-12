import { CommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";

import commands from "./commands";

async function help() {
  return {
    command: new SlashCommandBuilder().setName("help").setDescription("Check available commands"),
    handler: handleHelp,
  };

  async function handleHelp(interaction: CommandInteraction) {
    const fields = await Promise.all(
      commands.map(async command => {
        const cmd = (await command()).command;
        return {
          name: `/${cmd.name}`,
          value: cmd.description,
        };
      })
    );

    const embed = new EmbedBuilder()
      .setTitle("Available Commands")
      .setDescription("Here are the available commands:")
      .addFields(fields);

    interaction.reply({
      embeds: [embed],
    });
  }
}

export default help;
