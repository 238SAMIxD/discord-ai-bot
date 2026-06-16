import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from "discord.js";
import { makeRequest, getModels } from "../api/ollama.js";
import { log, logError } from "../utils/logger.js";
import {
  replySplitInteraction,
  downloadAttachment,
  splitText,
} from "../utils/helpers.js";
import { extractTextFromPDF } from "../utils/pdf.js";
import { config } from "../config.js";
import { LogLevel, BotCommand, OllamaShowResponse } from "../types.js";

const data = new SlashCommandBuilder()
  .setName("generate")
  .setDescription("Generate a response from Ollama (with file/image support)")
  .addStringOption((option) =>
    option
      .setName("prompt")
      .setDescription("The prompt for the generation")
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

for (let i = 1; i <= 5; i++) {
  data.addAttachmentOption((option) =>
    option
      .setName(`attachment${i}`)
      .setDescription(`Attach a file (text, PDF, or image) #${i}`)
      .setRequired(false),
  );
}

const generate: BotCommand = {
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

      // Process attachments (up to 5)
      const attachments = [];
      for (let i = 1; i <= 5; i++) {
        const att = interaction.options.getAttachment(`attachment${i}`);
        if (att) attachments.push(att);
      }

      const textAttachments = attachments.filter(
        (att) =>
          att.contentType?.startsWith("text") ||
          att.name.endsWith(".txt") ||
          att.name.endsWith(".json") ||
          att.name.endsWith(".js") ||
          att.name.endsWith(".ts"),
      );

      const pdfAttachments = attachments.filter(
        (att) => att.contentType?.includes("pdf") || att.name.endsWith(".pdf"),
      );

      const imageAttachments = attachments.filter((att) =>
        att.contentType?.startsWith("image"),
      );

      let finalPrompt = prompt;

      // 1. Process Text Attachments
      if (textAttachments.length > 0) {
        const textContents = await Promise.all(
          textAttachments.map(async (att) => {
            const res = await downloadAttachment(att.url, "text");
            let text = String(res.data);
            if (text.length > config.maxAttachmentTextLength) {
              text =
                text.substring(0, config.maxAttachmentTextLength) +
                "\n\n[File truncated due to size]";
            }
            return `\n\n📄 File - ${att.name}:\n${text}`;
          }),
        );
        finalPrompt += textContents.join("");
      }

      // 2. Process PDF Attachments
      if (pdfAttachments.length > 0) {
        const pdfContents = await Promise.all(
          pdfAttachments.map(async (att) => {
            const res = await downloadAttachment(att.url, "arraybuffer");
            let text = await extractTextFromPDF(
              Buffer.from(res.data as ArrayBuffer),
            );
            if (text.length > config.maxAttachmentTextLength) {
              text =
                text.substring(0, config.maxAttachmentTextLength) +
                "\n\n[PDF truncated due to size]";
            }
            return `\n\n📑 PDF - ${att.name}:\n${text}`;
          }),
        );
        finalPrompt += pdfContents.join("");
      }

      // 3. Process Image Attachments (base64)
      const imagesBase64: string[] = [];
      if (imageAttachments.length > 0) {
        const imageContents = await Promise.all(
          imageAttachments.map(async (att) => {
            const res = await downloadAttachment(att.url, "arraybuffer");
            return Buffer.from(res.data as ArrayBuffer).toString("base64");
          }),
        );
        imagesBase64.push(...imageContents);
      }

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

      const payload: Record<string, unknown> = {
        model,
        prompt: finalPrompt,
        stream,
      };

      if (systemMessage) {
        payload.system = systemMessage;
      }
      if (imagesBase64.length > 0) {
        payload.images = imagesBase64;
      }

      if (!stream) {
        const response = await makeRequest<any>(
          "/api/generate",
          "post",
          payload,
          "json",
        );
        const responseText = response?.response || "(No response from Ollama)";

        await replySplitInteraction(interaction, responseText, true);
      } else {
        const responseStream = await makeRequest<any>(
          "/api/generate",
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
              // Ignore minor edit/rate limit errors
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
              const text = parsedData.response || "";
              streamState.fullResponse += text;
            } catch {
              // Partial JSON line
            }
          }
          void updateMessage();
        });

        responseStream.on("end", async () => {
          if (streamState.buffer.trim().length > 0) {
            try {
              const parsedData = JSON.parse(streamState.buffer.trim()) as any;
              const text = parsedData.response || "";
              streamState.fullResponse += text;
            } catch {
              // Ignore
            }
          }

          await updateMessage(true);
          const cleanText = streamState.fullResponse.trim() || "(No response)";

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
      await interaction.editReply({ content: "Failed to run generate." });
    }
  },
};

export default generate;
