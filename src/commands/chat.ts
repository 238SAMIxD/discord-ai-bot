import {
  CommandInteraction,
  Message,
  OmitPartialGroupDMChannel,
  SlashCommandBuilder,
} from "discord.js";
import { LogLevel } from "meklog";

import { log } from "../bot";
import { MAX_COMMAND_CHOICES, MAX_MESSAGE_LENGTH, MESSAGE_CHUNK_SIZE } from "../utils/consts";
import { HistoryMessage, historyService } from "../utils/historyService";
import { getModelInfo, getModels, makeRequest, METHOD } from "../utils/service";
import { parseEnvString, replySplitMessage } from "../utils/utils";

interface OllamaMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export type ChatOptions = {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
};

interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  on: (event: string, listener: (chunk: Buffer) => void) => void;
}

interface Model {
  model: string;
  name: string;
}

const SERVER = process.env.OLLAMA;

async function chat(fetch = false) {
  const models = (fetch && SERVER && ((await getModels(SERVER, "/api/tags"))?.models || [])) || [];
  const tooManyModels = models.length > MAX_COMMAND_CHOICES;

  if (tooManyModels && fetch) {
    log(
      LogLevel.Warning,
      `Found ${models.length} models, which exceeds Discord's limit of ${MAX_COMMAND_CHOICES} choices. Using text input instead.`
    );
  }

  const command = new SlashCommandBuilder()
    .setName("chat")
    .setDescription("Chat with Ollama")
    .addStringOption(option =>
      option.setName("prompt").setDescription("Prompt to chat with Ollama").setRequired(true)
    );

  if (tooManyModels) {
    command.addStringOption(option =>
      option
        .setName("model")
        .setDescription("Model to use (use /models ollama to see available models)")
        .setRequired(true)
    );
  } else {
    command.addStringOption(option =>
      option
        .setName("model")
        .setDescription("Model to use")
        .setRequired(true)
        .addChoices(
          models.map((model: Model) => ({
            name: model.name,
            value: model.model,
          }))
        )
    );
  }

  command.addBooleanOption(option =>
    option.setName("stream").setDescription("(Experimental) Stream response").setRequired(false)
  );

  return {
    command,
    handler: handleChat,
  };

  async function handleChat(interaction: CommandInteraction) {
    const { options } = interaction;
    const userId = interaction.user.id;

    const prompt = options.get("prompt")!.value as string;
    const model = options.get("model")!.value as string;
    const stream = (options.get("stream")?.value as boolean) ?? false;

    const useSystemMessage = process.env.USE_SYSTEM !== "false";
    const useModelSystemMessage = process.env.USE_MODEL_SYSTEM === "true";
    const systemPrompts = [];

    const userMessage: HistoryMessage = { role: "user", content: prompt };
    const userHistory = historyService.getUserHistory(userId);
    const messages: OllamaMessage[] = [...userHistory, userMessage];

    historyService.addMessage(userId, userMessage);

    if (useModelSystemMessage) {
      const modelInfo = await getModelInfo(SERVER!, "/api/show", model);
      if (modelInfo && modelInfo.system) {
        systemPrompts.push(parseEnvString(modelInfo.system));
      }
    }

    if (useSystemMessage) {
      systemPrompts.push(parseEnvString(process.env.SYSTEM_PROMPT || ""));
    }

    if (systemPrompts.length > 0) {
      const systemMessage: OllamaMessage = {
        role: "system",
        content: systemPrompts.join("\n"),
      };

      messages.unshift(systemMessage);
    }

    await interaction.deferReply();
    try {
      const requestData: ChatOptions = {
        model,
        messages,
        stream,
      };

      log(
        LogLevel.Debug,
        `Sending chat request with ${messages.length} messages for user ${userId}`
      );

      const response: OllamaChatResponse = await makeRequest(
        SERVER!,
        "/api/chat",
        METHOD.POST,
        requestData,
        stream
      );

      if (!stream) {
        const responseContent = response.message?.content || "";

        const assistantMessage: HistoryMessage = {
          role: "assistant",
          content: responseContent,
        };
        historyService.addMessage(userId, assistantMessage);

        await replySplitMessage(interaction, responseContent, true);
        return;
      }

      const decoder = new TextDecoder();
      let message = "";
      const queue: Buffer[] = [];
      let processing = false;
      const streamMessages: (OmitPartialGroupDMChannel<Message<boolean>> | Message)[] = [];

      response.on("data", async (chunk: Buffer) => {
        queue.push(chunk);
        processQueue();
      });

      response.on("end", async () => {
        await processQueue(true); // It may miss the last chunks

        if (message) {
          const assistantMessage: HistoryMessage = {
            role: "assistant",
            content: message,
          };
          historyService.addMessage(userId, assistantMessage);
        }
      });

      async function processQueue(isEnd = false) {
        if (processing) return;
        processing = true;

        let chunkBuffer = "";
        while (queue.length > 0) {
          const chunk = queue.shift()!;

          try {
            const data = JSON.parse(decoder.decode(chunk, { stream: true }));
            const text = data.message?.content || "";

            if (text) {
              chunkBuffer += text;
              message += text;

              if (chunkBuffer.length >= MESSAGE_CHUNK_SIZE || isEnd) {
                if (message.length > MAX_MESSAGE_LENGTH - MESSAGE_CHUNK_SIZE) {
                  streamMessages.push(
                    streamMessages.length === 0
                      ? await interaction.followUp(message)
                      : await streamMessages[streamMessages.length - 1].reply({
                          content: message,
                        })
                  );
                  message = "";
                } else {
                  if (streamMessages.length === 0) {
                    await interaction.editReply(message);
                  } else {
                    await streamMessages[streamMessages.length - 1].edit(message);
                  }
                  chunkBuffer = "";
                }
              }
            }
          } catch (parseError) {
            log(LogLevel.Error, `Failed to parse JSON: ${parseError}`);
          }
        }

        processing = false;
        if (isEnd && message.length > 0) {
          if (streamMessages.length === 0) {
            await interaction.editReply(message);
            return;
          }

          await streamMessages[streamMessages.length - 1].edit(message);
        }
      }
    } catch (error) {
      log(LogLevel.Error, `Error in chat command: ${error}`);
      await interaction.editReply({
        content: "Failed to generate response",
      });
    }
  }
}

export default chat;
