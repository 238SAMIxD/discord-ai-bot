import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import { LogLevel } from "meklog";

import { log } from "../bot";
import { historyService } from "../utils/historyService";

async function clearHistory() {
  return {
    command: new SlashCommandBuilder()
      .setName("clearhistory")
      .setDescription("Clear your chat history with the bot"),
    handler: handleClearHistory,
  };

  async function handleClearHistory(interaction: CommandInteraction) {
    try {
      const userId = interaction.user.id;

      if (!historyService.hasHistory(userId)) {
        await interaction.reply({
          content: "You don't have any chat history to clear.",
          ephemeral: true,
        });
        return;
      }

      historyService.clearHistory(userId);

      await interaction.reply({
        content: "Your chat history has been cleared successfully!",
        ephemeral: true,
      });

      log(LogLevel.Info, `Chat history cleared for user ${userId} (${interaction.user.username})`);
    } catch (error) {
      log(LogLevel.Error, `Failed to clear chat history: ${error}`);
      await interaction.reply({
        content: "Failed to clear chat history. Please try again later.",
        ephemeral: true,
      });
    }
  }
}

export default clearHistory;
