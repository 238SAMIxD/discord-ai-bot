import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { logError } from "../utils/logger.js";
import { clearUserHistory, getUserStats } from "../state/conversations.js";
import { cancelPendingChats } from "../state/pendingChats.js";
import { BotCommand } from "../types.js";

const data = new SlashCommandBuilder()
  .setName("clearhistory")
  .setDescription("Clear your conversation history in this channel");

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

const clearHistory: BotCommand = {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await interaction.deferReply();
      const channelID = interaction.channelId ?? "";
      const userID = interaction.user.id;
      const { chats } = getUserStats(channelID, userID);

      clearUserHistory(channelID, userID);
      const pending = cancelPendingChats(channelID, userID);

      const cleared: string[] = [];
      if (chats > 0) {
        cleared.push(
          `your conversation history (${plural(Math.floor(chats / 2), "chat")})`,
        );
      }
      if (pending > 0) {
        cleared.push(plural(pending, "pending message"));
      }

      await interaction.editReply({
        content:
          cleared.length > 0
            ? `Cleared ${cleared.join(" and ")} in this channel.`
            : "You have no conversation history to clear in this channel.",
      });
    } catch (error) {
      logError(error);
      await interaction.editReply({
        content: "Error, please check the console.",
      });
    }
  },
};

export default clearHistory;
