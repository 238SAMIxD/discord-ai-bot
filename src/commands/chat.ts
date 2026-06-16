import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from "discord.js";
import { makeRequest, getModels } from "../api/ollama.js";
import { log, logError } from "../utils/logger.js";
import { replySplitInteraction, splitText } from "../utils/helpers.js";
import { config } from "../config.js";
import { LogLevel, BotCommand, OllamaShowResponse } from "../types.js";
import { chatHistory } from "../state/conversations.js";

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
      const model = interaction.options.getString("model") ?? config.model;
      const stream = interaction.options.getBoolean("stream") ?? false;
      const channelID = interaction.channelId ?? "";

      const systemMessages: string[] = [];
      if (config.useModelSystemMessage) {
        try {
          const info = await makeRequest<OllamaShowResponse>(
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
      if (config.useCustomSystemMessage && config.customSystemMessage) {
        systemMessages.push(config.customSystemMessage);
      }

      const systemMessage = systemMessages.join("\n\n");
      const messagesToSend: {
        role: "user" | "assistant" | "system";
        content: string;
      }[] = [];

      if (systemMessage) {
        messagesToSend.push({ role: "system", content: systemMessage });
      }

      chatHistory[channelID] = chatHistory[channelID] ?? [];
      messagesToSend.push(...chatHistory[channelID]);
      messagesToSend.push({ role: "user", content: prompt });

      const payload = {
        model,
        messages: messagesToSend,
        stream,
      };

      if (!stream) {
        const response = await makeRequest<any>(
          "/api/chat",
          "post",
          payload,
          "json",
        );
        const responseText =
          response?.message?.content || "(No response from Ollama)";

        chatHistory[channelID].push({ role: "user", content: prompt });
        chatHistory[channelID].push({
          role: "assistant",
          content: responseText,
        });

        await replySplitInteraction(interaction, responseText, true);
      } else {
        const responseStream = await makeRequest<any>(
          "/api/chat",
          "post",
          payload,
          "stream",
        );

        const streamState = {
          fullResponse: "",
          buffer: "",
          lastEditTime: Date.now(),
          editPromise: Promise.resolve<unknown>(),
        };

        const updateMessage = async (force = false) => {
          const now = Date.now();
          if (force || now - streamState.lastEditTime >= 1000) {
            streamState.lastEditTime = now;
            await streamState.editPromise;
            const cleanText = streamState.fullResponse.trim();
            if (cleanText.length === 0) return;
            try {
              const segments = splitText(cleanText, 2000);
              streamState.editPromise = interaction.editReply(segments[0]);
              await streamState.editPromise;
            } catch {
              // Ignore minor edit/rate limit errors during streaming
            }
          }
        };

        responseStream.on("data", (chunk: Buffer) => {
          streamState.buffer += chunk.toString();
          const lines = streamState.buffer.split("\n");
          streamState.buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.length === 0) continue;
            try {
              const parsedData = JSON.parse(trimmedLine) as any;
              const text = parsedData.message?.content || "";
              streamState.fullResponse += text;
            } catch {
              // Partial JSON line or parse error
            }
          }
          void updateMessage();
        });

        responseStream.on("end", async () => {
          // Parse any final remaining string in the buffer
          if (streamState.buffer.trim().length > 0) {
            try {
              const parsedData = JSON.parse(streamState.buffer.trim()) as any;
              const text = parsedData.message?.content || "";
              streamState.fullResponse += text;
            } catch {
              // Ignore
            }
          }

          await updateMessage(true);
          const cleanText = streamState.fullResponse.trim() || "(No response)";

          chatHistory[channelID].push({ role: "user", content: prompt });
          chatHistory[channelID].push({
            role: "assistant",
            content: cleanText,
          });

          // Send remaining segments if content exceeds 2000 characters
          const segments = splitText(cleanText, 2000);
          if (segments.length > 1) {
            try {
              for (let i = 1; i < segments.length; i++) {
                await interaction.followUp({
                  content: segments[i],
                  fetchReply: true,
                });
              }
            } catch (err) {
              logError(err);
            }
          }
        });

        responseStream.on("error", (err: unknown) => {
          logError(err);
          void interaction.editReply({
            content: "Error occurred while streaming response.",
          });
        });
      }
    } catch (error) {
      logError(error);
      await interaction.editReply({ content: "Failed to run chat." });
    }
  },
};

export default chat;
