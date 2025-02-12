import {
  CommandInteraction,
  Message,
  OmitPartialGroupDMChannel,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { LogLevel } from "meklog";

import { log } from "../bot";
import { getModels, makeRequest, METHOD } from "../utils/service";
import { replySplitMessage } from "../utils/utils";

export type ChatOptions = {
  model: string;
  prompt: string;
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

  return {
    command: new SlashCommandBuilder()
      .setName("chat")
      .setDescription("Chat with Ollama")
      .addStringOption(option =>
        option.setName("prompt").setDescription("Prompt to chat with Ollama").setRequired(true)
      )
      .addStringOption(option =>
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
      )
      .addBooleanOption(option =>
        option.setName("stream").setDescription("(Experimental) Stream response").setRequired(false)
      ),
    handler: handleChat,
  };

  async function handleChat(interaction: CommandInteraction) {
    const { options } = interaction;

    const prompt = options.get("prompt")!.value as string;
    const model = options.get("model")!.value as string;
    const stream = (options.get("stream")?.value as boolean) ?? false;

    await interaction.deferReply();
    try {
      const response: OllamaResponse = await makeRequest(
        SERVER!,
        "/api/generate",
        METHOD.POST,
        { prompt, model, stream },
        stream
      );

      if (!stream) {
        await replySplitMessage(interaction, response.response, true);
        return;
      }

      const decoder = new TextDecoder();
      let part = "";
      let message = "";
      let wholeMessage = "";
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
          const text = decoder.decode(chunk, { stream: true });
          try {
            const data = JSON.parse(text);
            part += data.response;
            message += data.response;
            wholeMessage += data.response;
            if (part.length >= 100 || isEnd) {
              if (message.length > 1900) {
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
                part = "";
              }
            }
          } catch (parseError) {
            log(LogLevel.Error, `Failed to parse JSON: ${parseError}`);
          }
        }

        processing = false;
        if (isEnd) {
          if (message.length > 0) {
            if (messages.length === 0) {
              await interaction.editReply(message);
            } else {
              await messages[messages.length - 1].edit(message);
            }
          }
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
