import {
  Attachment,
  CommandInteraction,
  Message,
  OmitPartialGroupDMChannel,
  SlashCommandBuilder,
} from "discord.js";
import { LogLevel } from "meklog";

import { log } from "../bot";
import { MAX_COMMAND_CHOICES, MAX_MESSAGE_LENGTH, MESSAGE_CHUNK_SIZE } from "../utils/consts";
import {
  downloadAttachment,
  extractTextFromPDF,
  getModelInfo,
  getModels,
  makeRequest,
  METHOD,
} from "../utils/service";
import { parseEnvNumber, parseEnvString, replySplitMessage } from "../utils/utils";

export type GenerateOptions = {
  model: string;
  prompt: string;
  system?: string;
  stream?: boolean;
  images?: string[];
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
const MAX_ATTACHMENTS = parseEnvNumber(process.env.MAX_ATTACHMENTS ?? "1") ?? 1;

async function generate(fetch = false) {
  const models = (fetch && SERVER && ((await getModels(SERVER, "/api/tags"))?.models || [])) || [];
  const tooManyModels = models.length > MAX_COMMAND_CHOICES;

  if (tooManyModels && fetch) {
    log(
      LogLevel.Warning,
      `Found ${models.length} models, which exceeds Discord's limit of ${MAX_COMMAND_CHOICES} choices. Using text input instead.`
    );
  }

  const command = new SlashCommandBuilder()
    .setName("generate")
    .setDescription("Generate a one-time response without saving history")
    .addStringOption(option =>
      option.setName("prompt").setDescription("Prompt to generate a response").setRequired(true)
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

  for (let i = 1; i <= MAX_ATTACHMENTS; i++) {
    command.addAttachmentOption(option =>
      option
        .setName(`attachment${i}`)
        .setDescription(`Attach text file number ${i}`)
        .setRequired(false)
    );
  }

  command.addBooleanOption(option =>
    option.setName("stream").setDescription("(Experimental) Stream response").setRequired(false)
  );

  return {
    command,
    handler: handleGenerate,
  };

  async function handleGenerate(interaction: CommandInteraction) {
    await interaction.deferReply();

    const { options } = interaction;
    const userId = interaction.user.id;

    const prompt = options.get("prompt")!.value as string;
    const model = options.get("model")!.value as string;
    const stream = (options.get("stream")?.value as boolean) ?? false;
    const attachments: Attachment[] = [];
    for (let i = 1; i <= MAX_ATTACHMENTS; i++) {
      const attachment = options.get(`attachment${i}`)?.attachment;
      if (attachment) {
        attachments.push(attachment);
      }
    }
    const textAttachments = attachments.filter(
      attachment =>
        attachment.contentType?.startsWith("text") ||
        attachment.contentType?.includes("json") ||
        attachment.contentType?.includes("xml") ||
        attachment.contentType?.includes("sh") ||
        attachment.contentType?.includes("php")
    );

    const pdfAttachments = attachments.filter(attachment =>
      attachment.contentType?.includes("pdf")
    );

    const imageAttachments = attachments.filter(attachment =>
      attachment.contentType?.startsWith("image")
    );

    let userInput = prompt;

    if (textAttachments.length > 0) {
      try {
        await Promise.all(
          textAttachments.map(async (attachment, i) => {
            const response = await downloadAttachment(attachment.url, "text");
            let content = response.data;

            if (content.length > 8000) {
              content = content.substring(0, 8000) + "\n\n[File truncated due to size]";
              log(
                LogLevel.Warning,
                `Text file attachment truncated from ${response.data.length} characters`
              );
            }

            userInput += `\n\n📄 Text File - ${attachment.name}:\n${content}`;
          })
        );
      } catch (error) {
        log(LogLevel.Error, `Failed to process text files: ${error}`);
        await interaction.editReply({
          content: `Failed to process text attachments. Error: ${error instanceof Error ? error.message : String(error)}`,
        });
        return;
      }
    }

    if (pdfAttachments.length > 0) {
      try {
        await Promise.all(
          pdfAttachments.map(async attachment => {
            try {
              const response = await downloadAttachment(attachment.url, "arraybuffer");
              const pdfBuffer = Buffer.from(response.data);
              let pdfText = await extractTextFromPDF(pdfBuffer);

              if (pdfText.length > 8000) {
                pdfText = pdfText.substring(0, 8000) + "\n\n[PDF content truncated due to size]";
                log(LogLevel.Warning, `PDF content truncated from ${pdfText.length} characters`);
              }

              userInput += `\n\n📑 PDF Document - ${attachment.name}:\n${pdfText}`;
              log(LogLevel.Info, `Successfully extracted text from PDF ${attachment.name}`);
            } catch (pdfError) {
              log(LogLevel.Error, `Failed to process PDF ${attachment.name}: ${pdfError}`);
              userInput += `\n\n📑 PDF Document - ${attachment.name}: [Error: Could not extract text from this PDF]`;
            }
          })
        );
      } catch (error) {
        log(LogLevel.Error, `Failed to process PDF files: ${error}`);
        await interaction.editReply({
          content: `Failed to process PDF attachments. Error: ${error instanceof Error ? error.message : String(error)}`,
        });
        return;
      }
    }

    const useSystemMessage = process.env.USE_SYSTEM !== "false";
    const useModelSystemMessage = process.env.USE_MODEL_SYSTEM === "true";
    const systemPrompts = [];

    if (useModelSystemMessage) {
      const modelInfo = await getModelInfo(SERVER!, "/api/show", model);
      if (modelInfo && modelInfo.system) {
        systemPrompts.push(parseEnvString(modelInfo.system));
      }
    }

    if (useSystemMessage) {
      systemPrompts.push(parseEnvString(process.env.SYSTEM || ""));
    }

    try {
      const images: string[] = [];
      if (imageAttachments.length > 0) {
        try {
          await Promise.all(
            imageAttachments.map(async attachment => {
              const response = await downloadAttachment(attachment.url, "arraybuffer");
              images.push(Buffer.from(response.data).toString("base64"));
            })
          );
        } catch (error) {
          log(LogLevel.Error, `Failed to download image files: ${error}`);
          await interaction.editReply({
            content: `Failed to download image attachments. Error: ${error instanceof Error ? error.message : String(error)}`,
          });
          return;
        }
      }

      const requestData: GenerateOptions = {
        model,
        prompt: userInput,
        stream,
      };

      if (systemPrompts.length > 0) {
        requestData.system = systemPrompts.join("\n");
      }

      if (images.length > 0) {
        requestData.images = images;
      }

      log(
        LogLevel.Debug,
        `Sending generate request for user ${userId} with ${textAttachments.length} text file(s), ${pdfAttachments.length} PDF file(s), and ${imageAttachments.length} image(s)`
      );

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
      let message = "";
      const queue: Buffer[] = [];
      let processing = false;
      const streamMessages: (OmitPartialGroupDMChannel<Message<boolean>> | Message)[] = [];

      response.on("data", async (chunk: Buffer) => {
        queue.push(chunk);
        processQueue();
      });

      response.on("end", async () => {
        await processQueue(true);
      });

      async function processQueue(isEnd = false) {
        if (processing) return;
        processing = true;

        let chunkBuffer = "";
        while (queue.length > 0) {
          const chunk = queue.shift()!;

          try {
            const data = JSON.parse(decoder.decode(chunk, { stream: true }));
            const text = data.response || "";

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
      log(LogLevel.Error, `Error in generate command: ${error}`);
      await interaction.editReply({
        content: "Failed to generate response",
      });
    }
  }
}

export default generate;
