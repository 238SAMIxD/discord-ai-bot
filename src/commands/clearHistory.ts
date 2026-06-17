import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { logError } from "../utils/logger.js";
import { messages, chatHistory } from "../state/conversations.js";
import { BotCommand } from "../types.js";

const data = new SlashCommandBuilder()
  .setName("clearhistory")
  .setDescription("Clear the conversation history for this channel");

const clearHistory: BotCommand = {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply();
      const channelID = interaction.channelId ?? "";
      const clearedGenerate = messages[channelID]
        ? messages[channelID].amount
        : 0;
      const clearedChat = chatHistory[channelID]
        ? chatHistory[channelID].length
        : 0;

      delete messages[channelID];
      delete chatHistory[channelID];

      if (clearedGenerate > 0 || clearedChat > 0) {
        const text = `Cleared conversation history (${clearedGenerate} generations, ${Math.floor(clearedChat / 2)} chats) for this channel.`;
        await interaction.editReply({
          content: text,
        });
      } else {
        await interaction.editReply({
          content: "No conversation history to clear in this channel.",
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
