import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  MessageFlags,
} from "discord.js";
import { makeRequest, getModels, buildSystemMessage } from "../api/ollama.js";
import { ServersBusyError } from "../api/base.js";
import { logError } from "../utils/logger.js";
import {
  replySplitInteraction,
  downloadAttachment,
  BUSY_MESSAGE,
} from "../utils/helpers.js";
import { handleStreamResponse } from "../utils/stream.js";
import { statsComponents } from "../utils/stats.js";
import { extractTextFromPDF } from "../utils/pdf.js";
import { createStopButton } from "../utils/stopButton.js";
import { buildBotContext } from "../utils/botContext.js";
import {
  cancelSlowmode,
  finishSlowmode,
  slowmodeMessage,
  tryStartSlowmode,
} from "../state/slowmode.js";
import { getConfig } from "../config.js";
import {
  BotCommand,
  OllamaGenerateResponse,
  OllamaGenerateRequest,
} from "../types.js";

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
    const waitLeft = tryStartSlowmode(interaction.user.id);
    if (waitLeft > 0) {
      await interaction.reply({
        content: slowmodeMessage(waitLeft),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const stop = createStopButton(interaction);
    let stoppedPartway = false;
    try {
      await interaction.deferReply();
      await stop.show();
      const prompt = interaction.options.getString("prompt", true);
      const model = interaction.options.getString("model") ?? getConfig().model;
      const stream = interaction.options.getBoolean("stream") ?? false;

      // Process attachments (up to 5)
      const attachments = [];
      for (let i = 1; i <= 5; i++) {
        const att = interaction.options.getAttachment(`attachment${i}`);
        if (att) attachments.push(att);
      }

      const TEXT_EXTENSIONS = [
        ".txt",
        ".json",
        ".js",
        ".ts",
        ".md",
        ".yaml",
        ".yml",
        ".csv",
        ".xml",
        ".html",
        ".css",
        ".py",
        ".rb",
        ".go",
        ".java",
        ".c",
        ".cpp",
        ".h",
        ".rs",
        ".sh",
        ".bat",
        ".toml",
        ".ini",
        ".cfg",
        ".env",
        ".log",
        ".sql",
      ];
      const textAttachments = attachments.filter(
        (att) =>
          att.contentType?.startsWith("text") ||
          att.contentType === "application/json" ||
          att.contentType === "application/xml" ||
          TEXT_EXTENSIONS.some((ext) => att.name.toLowerCase().endsWith(ext)),
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
            const res = await downloadAttachment(att.url, "text", stop.signal);
            let text = String(res.data);
            if (text.length > getConfig().maxAttachmentTextLength) {
              text =
                text.substring(0, getConfig().maxAttachmentTextLength) +
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
            const res = await downloadAttachment(
              att.url,
              "arraybuffer",
              stop.signal,
            );
            let text = await extractTextFromPDF(
              Buffer.from(res.data as ArrayBuffer),
              stop.signal,
            );
            if (text.length > getConfig().maxAttachmentTextLength) {
              text =
                text.substring(0, getConfig().maxAttachmentTextLength) +
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
            const res = await downloadAttachment(
              att.url,
              "arraybuffer",
              stop.signal,
            );
            return Buffer.from(res.data as ArrayBuffer).toString("base64");
          }),
        );
        imagesBase64.push(...imageContents);
      }

      const systemMessage = await buildSystemMessage(
        model,
        stop.signal,
        await buildBotContext(interaction),
        stop.queueStatus,
      );

      const payload: OllamaGenerateRequest = {
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
        const response = await makeRequest<
          OllamaGenerateResponse,
          OllamaGenerateRequest
        >(
          "/api/generate",
          "post",
          payload,
          "json",
          stop.signal,
          stop.queueStatus,
        );
        stop.complete();
        const responseText = response?.response || "(No response from Ollama)";

        await replySplitInteraction(
          interaction,
          responseText,
          true,
          statsComponents(response),
        );
      } else {
        const responseStream = await makeRequest<
          NodeJS.ReadableStream,
          OllamaGenerateRequest
        >(
          "/api/generate",
          "post",
          payload,
          "stream",
          stop.signal,
          stop.queueStatus,
        );

        stoppedPartway = await handleStreamResponse<OllamaGenerateResponse>(
          interaction,
          responseStream,
          () => stop.complete(),
          stop.signal,
        );
      }
    } catch (error) {
      if (stop.signal.aborted) {
        await interaction.editReply({ content: "Stopped." });
      } else if (error instanceof ServersBusyError) {
        cancelSlowmode(interaction.user.id);
        await interaction.editReply({
          content: BUSY_MESSAGE,
          components: [],
        });
      } else {
        logError(error);
        await interaction.editReply({
          content: "Failed to run generate.",
          components: [],
        });
      }
    } finally {
      finishSlowmode(interaction.user.id);
      await stop.finish(stoppedPartway);
    }
  },
};

export default generate;
