import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { logError } from "../utils/logger.js";
import { clearUserHistory, getUserStats } from "../state/conversations.js";
import { BotCommand } from "../types.js";

const data = new SlashCommandBuilder()
  .setName("clearhistory")
  .setDescription("Clear your conversation history in this channel");

const clearHistory: BotCommand = {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply();
      const channelID = interaction.channelId ?? "";
      const userID = interaction.user.id;
      const { chats: clearedChat } = getUserStats(channelID, userID);

      clearUserHistory(channelID, userID);

      if (clearedChat > 0) {
        const text = `Cleared your conversation history (${Math.floor(clearedChat / 2)} chats) in this channel.`;
        await interaction.editReply({
          content: text,
        });
      } else {
        await interaction.editReply({
          content: "You have no conversation history to clear in this channel.",
        });
      }
    } catch (error) {
      logError(error);
      await interaction.editReply({
        content: "Error, please check the console.",
      });
    }
  },
};

export default clearHistory;
