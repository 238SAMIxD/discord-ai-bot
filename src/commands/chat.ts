import {
  CommandInteraction,
  Message,
  OmitPartialGroupDMChannel,
  SlashCommandBuilder,
} from "discord.js";
import { LogLevel } from "meklog";

import { log } from "../bot";
import { MAX_COMMAND_CHOICES, MAX_MESSAGE_LENGTH, MESSAGE_CHUNK_SIZE } from "../utils/consts";
import { getModelInfo, getModels, makeRequest, METHOD } from "../utils/service";
import { parseEnvString, replySplitMessage } from "../utils/utils";

export type ChatOptions = {
  model: string;
  prompt: string;
  system?: string;
  stream?: boolean;
};

interface OllamaResponse {
  response: string;
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

  // If too many models, use a regular string input instead of choices
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

  // Add the stream option
  command.addBooleanOption(option =>
    option.setName("stream").setDescription("(Experimental) Stream response").setRequired(false)
  );

  return {
    command,
    handler: handleChat,
  };

  async function handleChat(interaction: CommandInteraction) {
    const { options } = interaction;

    const prompt = options.get("prompt")!.value as string;
    const model = options.get("model")!.value as string;
    const stream = (options.get("stream")?.value as boolean) ?? false;

    // Check if system prompt should be used
    const useSystemMessage = process.env.USE_SYSTEM !== "false";
    const useModelSystemMessage = process.env.USE_MODEL_SYSTEM === "true";
    const systemPrompts = [];

    // Only use model system prompt if USE_MODEL_SYSTEM is true
    if (useModelSystemMessage) {
      const modelInfo = await getModelInfo(SERVER!, "/api/show", model);
      if (modelInfo && modelInfo.system) {
        systemPrompts.push(parseEnvString(modelInfo.system));
      }
    }

    // Only use system prompt if USE_SYSTEM is true
    if (useSystemMessage) {
      systemPrompts.push(parseEnvString(process.env.SYSTEM_PROMPT || ""));
    }

    await interaction.deferReply();
    try {
      const requestData: ChatOptions = {
        prompt,
        model,
        stream,
      };

      if (systemPrompts.length > 0) {
        requestData.system = systemPrompts.join("\n");
      }

      const response: OllamaResponse = await makeRequest(
        SERVER!,
        "/api/generate",
        METHOD.POST,
        requestData,
        stream
      );

      if (!stream) {
        await replySplitMessage(interaction, response.response, true);
        return;
      }

      const decoder = new TextDecoder();
      let chunkBuffer = "";
      let message = "";
      const queue: Buffer[] = [];
      let processing = false;
      const messages: (OmitPartialGroupDMChannel<Message<boolean>> | Message)[] = [];

      response.on("data", async (chunk: Buffer) => {
        queue.push(chunk);
        processQueue();
      });

      response.on("end", async () => {
        await processQueue(true); // it still misses last several chunks
      });

      async function processQueue(isEnd = false) {
        if (processing) return;
        processing = true;

        while (queue.length > 0) {
          const chunk = queue.shift()!;
          try {
            const data = JSON.parse(decoder.decode(chunk, { stream: true }));
            const text = data.response;
            chunkBuffer += text;
            message += text;
            if (chunkBuffer.length >= MESSAGE_CHUNK_SIZE || isEnd) {
              if (message.length > MAX_MESSAGE_LENGTH - MESSAGE_CHUNK_SIZE) {
                messages.push(
                  messages.length === 0
                    ? await interaction.followUp(message)
                    : await messages[messages.length - 1].reply({
                        content: message,
                      })
                );
                message = "";
              } else {
                if (messages.length === 0) {
                  await interaction.editReply(message);
                } else {
                  await messages[messages.length - 1].edit(message);
                }
                chunkBuffer = "";
              }
            }
          } catch (parseError) {
            log(LogLevel.Error, `Failed to parse JSON: ${parseError}`);
          }
        }

        processing = false;
        if (isEnd && message.length > 0) {
          if (messages.length === 0) {
            await interaction.editReply(message);
            return;
          }

          await messages[messages.length - 1].edit(message);
        }
      }
    } catch (error) {
      log(LogLevel.Error, error);
      await interaction.editReply({
        content: "Failed to generate response",
      });
    }
  }
}
export default chat;
