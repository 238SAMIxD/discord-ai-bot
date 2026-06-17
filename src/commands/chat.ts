import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from "discord.js";
import { makeRequest, getModels } from "../api/ollama.js";
import { log, logError } from "../utils/logger.js";
import { replySplitInteraction } from "../utils/helpers.js";
import { handleStreamResponse } from "../utils/stream.js";
import { getConfig } from "../config.js";
import { BotCommand, OllamaShowResponse, OllamaChatResponse, OllamaShowRequest, OllamaChatRequest } from "../types.js";
import { LogLevel } from "../utils/logger.js";
import { getChatHistory, addChatMessage } from "../state/conversations.js";

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
    try {
      await interaction.deferReply();
      const prompt = interaction.options.getString("prompt", true);
      const model = interaction.options.getString("model") ?? getConfig().model;
      const stream = interaction.options.getBoolean("stream") ?? false;
      const channelID = interaction.channelId ?? "";

      const systemMessages: string[] = [];
      if (getConfig().useModelSystemMessage) {
        try {
          const info = await makeRequest<OllamaShowResponse, OllamaShowRequest>(
            "/api/show",
            "post",
            { name: model },
          );
          if (info?.system) systemMessages.push(info.system);
        } catch (e) {
          log.log(
            LogLevel.Debug,
            `Could not fetch model system message for ${model}`,
            e,
          );
        }
      }
      if (getConfig().useCustomSystemMessage && getConfig().customSystemMessage) {
        systemMessages.push(getConfig().customSystemMessage!);
      }

      const systemMessage = systemMessages.join("\n\n");
      const messagesToSend: {
        role: "user" | "assistant" | "system";
        content: string;
      }[] = [];

      if (systemMessage) {
        messagesToSend.push({ role: "system", content: systemMessage });
      }

      messagesToSend.push(...getChatHistory(channelID));
      messagesToSend.push({ role: "user", content: prompt });

      const payload: OllamaChatRequest = {
        model,
        messages: messagesToSend,
        stream,
      };

      if (!stream) {
        const response = await makeRequest<OllamaChatResponse, OllamaChatRequest>(
          "/api/chat",
          "post",
          payload,
          "json",
        );
        const responseText =
          response?.message?.content || "(No response from Ollama)";

        addChatMessage(channelID, { role: "user", content: prompt });
        addChatMessage(channelID, {
          role: "assistant",
          content: responseText,
        });

        await replySplitInteraction(interaction, responseText, true);
      } else {
        const responseStream = await makeRequest<NodeJS.ReadableStream, OllamaChatRequest>(
          "/api/chat",
          "post",
          payload,
          "stream",
        );

        handleStreamResponse<OllamaChatResponse>(
          interaction,
          responseStream,
          (cleanText) => {
            addChatMessage(channelID, { role: "user", content: prompt });
            addChatMessage(channelID, {
              role: "assistant",
              content: cleanText,
            });
          },
        );
      }
    } catch (error) {
      logError(error);
      await interaction.editReply({ content: "Failed to run chat." });
    }
  },
};

export default chat;
