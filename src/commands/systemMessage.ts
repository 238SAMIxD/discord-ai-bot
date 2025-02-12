import { CommandInteraction, SlashCommandBuilder } from "discord.js";

import { replySplitMessage } from "../utils/utils";

async function systemMessage() {
  return {
    command: new SlashCommandBuilder()
      .setName("systemmessage")
      .setDescription("Show the system message"),
    handler: handleSystemMessage,
  };

  async function handleSystemMessage(interaction: CommandInteraction) {
    await replySplitMessage(
      interaction,
      `System message:\n\n${process.env.SYSTEM || "There is no system message."}`
    );
  }
}

export default systemMessage;
