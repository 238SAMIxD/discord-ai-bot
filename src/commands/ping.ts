import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import { LogLevel } from "meklog";

import { log } from "../bot";

async function ping() {
  return {
    command: new SlashCommandBuilder().setName("ping").setDescription("Measure the bot's latency"),
    handler: handlePing,
  };

  async function handlePing(interaction: CommandInteraction) {
    await interaction.deferReply();
    try {
      const beforeTime = Date.now();
      const reply = await interaction.editReply({ content: "Measuring..." });

      const afterTime = Date.now();
      const difference = afterTime - beforeTime;

      await reply.edit({ content: `Latency: ${difference}ms` });
    } catch (error) {
      log(LogLevel.Error, `Failed to handle ping command - ${error}`);
      await interaction.editReply({
        content: "Error, please check the console",
      });
    }
  }
}

export default ping;
