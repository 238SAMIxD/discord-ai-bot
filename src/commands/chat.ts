import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from "discord.js";
import { makeRequest, getModels, buildSystemMessage } from "../api/ollama.js";
import { log, logError, LogLevel } from "../utils/logger.js";
import { replySplitInteraction, speakerName } from "../utils/helpers.js";
import { handleStreamResponse } from "../utils/stream.js";
import { statsComponents } from "../utils/stats.js";
import { getConfig } from "../config.js";
import { BotCommand, OllamaChatResponse, OllamaChatRequest } from "../types.js";
import {
  getUserHistory,
  addToUserHistory,
  startTurn,
} from "../state/conversations.js";
import { addPendingChat, removePendingChat } from "../state/pendingChats.js";
import { createStopButton } from "../utils/stopButton.js";
import { buildBotContext } from "../utils/botContext.js";

const data = new SlashCommandBuilder()
  .setName("chat")
  .setDescription("Chat with the Ollama bot (persists conversation context)")
  .addStringOption((option) =>
    option
      .setName("prompt")
      .setDescription("The message to send to the chatbot")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("model")
      .setDescription("Optional specific Ollama model to use")
      .setRequired(false)
      .setAutocomplete(true),
  )
  .addBooleanOption((option) =>
    option
      .setName("stream")
      .setDescription("Stream the response chunks (Experimental)")
      .setRequired(false),
  );

function saveExchange(
  channelID: string,
  userID: string,
  turn: number,
  content: string,
  reply: string,
): void {
  try {
    addToUserHistory(
      channelID,
      userID,
      turn,
      { role: "user", content },
      { role: "assistant", content: reply },
    );
  } catch (error) {
    log.log(LogLevel.Error, "Failed to save /chat history", error);
  }
}

const chat: BotCommand = {
  data,
  async autocomplete(interaction: AutocompleteInteraction) {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name === "model") {
      const typed = String(focusedOption.value).toLowerCase();
      const modelsList = await getModels();
      const filtered = modelsList
        .filter(
          (m) =>
            m.name.toLowerCase().includes(typed) ||
            m.model.toLowerCase().includes(typed),
        )
        .slice(0, 25);

      await interaction.respond(
        filtered.map((m) => ({ name: m.name, value: m.model })),
      );
    }
  },
  async execute(interaction: ChatInputCommandInteraction) {
    const channelID = interaction.channelId ?? "";
    const userID = interaction.user.id;
    const pending = addPendingChat(channelID, userID);
    const stop = createStopButton(interaction);
    const signal = AbortSignal.any([pending.signal, stop.signal]);
    let stoppedPartway = false;
    try {
      await interaction.deferReply();
      await stop.show();
      const prompt = interaction.options.getString("prompt", true);
      const model = interaction.options.getString("model") ?? getConfig().model;
      const stream = interaction.options.getBoolean("stream") ?? false;
      const content = `${speakerName(interaction)}: ${prompt}`;

      const systemMessage = await buildSystemMessage(
        model,
        signal,
        await buildBotContext(interaction),
      );
      const messagesToSend: {
        role: "user" | "assistant" | "system";
        content: string;
      }[] = [];

      if (systemMessage) {
        messagesToSend.push({ role: "system", content: systemMessage });
      }

      const turn = startTurn();
      messagesToSend.push(...getUserHistory(channelID, userID));
      messagesToSend.push({ role: "user", content });

      const payload: OllamaChatRequest = {
        model,
        messages: messagesToSend,
        stream,
      };

      const saveReply = (reply: string) => {
        removePendingChat(channelID, userID, pending);
        stop.complete();
        saveExchange(channelID, userID, turn, content, reply);
      };

      if (!stream) {
        const response = await makeRequest<
          OllamaChatResponse,
          OllamaChatRequest
        >("/api/chat", "post", payload, "json", signal);
        const responseText =
          response?.message?.content || "(No response from Ollama)";

        saveReply(responseText);

        await replySplitInteraction(
          interaction,
          responseText,
          true,
          statsComponents(response),
        );
      } else {
        const responseStream = await makeRequest<
          NodeJS.ReadableStream,
          OllamaChatRequest
        >("/api/chat", "post", payload, "stream", signal);

        stoppedPartway = await handleStreamResponse<OllamaChatResponse>(
          interaction,
          responseStream,
          saveReply,
          stop.signal,
        );
      }
    } catch (error) {
      if (stop.signal.aborted) {
        await interaction.editReply({ content: "Stopped." });
      } else if (pending.signal.aborted) {
        await interaction.editReply({
          content: "Cancelled because your conversation history was cleared.",
        });
      } else {
        logError(error);
        await interaction.editReply({
          content: "Failed to run chat.",
          components: [],
        });
      }
    } finally {
      removePendingChat(channelID, userID, pending);
      await stop.finish(stoppedPartway);
    }
  },
};

export default chat;
