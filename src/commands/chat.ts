import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  MessageFlags,
} from "discord.js";
import {
  makeRequest,
  getModels,
  buildSystemMessage,
  withLoadedContext,
} from "../api/ollama.js";
import { ServersBusyError } from "../api/base.js";
import { log, logError, LogLevel } from "../utils/logger.js";
import {
  replySplitInteraction,
  speakerName,
  BUSY_MESSAGE,
} from "../utils/helpers.js";
import { handleStreamResponse } from "../utils/stream.js";
import { statsComponents } from "../utils/stats.js";
import { getConfig } from "../config.js";
import {
  BotCommand,
  CommandFeatures,
  OllamaChatMessage,
  OllamaChatResponse,
  OllamaChatRequest,
  Server,
} from "../types.js";
import {
  getUserHistory,
  addToUserHistory,
  startTurn,
} from "../state/conversations.js";
import { addPendingChat, removePendingChat } from "../state/pendingChats.js";
import { createStopButton } from "../utils/stopButton.js";
import { buildBotContext } from "../utils/botContext.js";
import {
  cancelSlowmode,
  finishSlowmode,
  slowmodeMessage,
  tryStartSlowmode,
} from "../state/slowmode.js";
import {
  downloadImage,
  imageAttachmentError,
  imageMarker,
  visionRejection,
} from "../utils/images.js";

function buildData({ imageInput }: CommandFeatures) {
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
  if (imageInput) {
    data.addAttachmentOption((option) =>
      option
        .setName("image")
        .setDescription("An image for a vision model to look at")
        .setRequired(false),
    );
  }
  return data;
}

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
  data: buildData({ imageInput: false }),
  buildData,
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
      const image =
        getConfig().imageInput === false
          ? null
          : interaction.options.getAttachment("image");

      if (image) {
        const problem =
          imageAttachmentError(image) ?? (await visionRejection(model, signal));
        if (problem) {
          removePendingChat(channelID, userID, pending);
          stop.complete();
          cancelSlowmode(userID);
          await interaction.editReply({ content: problem, components: [] });
          return;
        }
      }

      const content = image
        ? `${speakerName(interaction)}: ${prompt} ${imageMarker(image)}`
        : `${speakerName(interaction)}: ${prompt}`;
      const images = image ? [await downloadImage(image, signal)] : [];

      const systemMessage = await buildSystemMessage(
        model,
        signal,
        await buildBotContext(interaction),
        stop.queueStatus,
      );
      const messagesToSend: OllamaChatMessage[] = [];

      if (systemMessage) {
        messagesToSend.push({ role: "system", content: systemMessage });
      }

      const turn = startTurn();
      messagesToSend.push(...getUserHistory(channelID, userID));
      messagesToSend.push(
        images.length > 0
          ? { role: "user", content, images }
          : { role: "user", content },
      );

      const payload: OllamaChatRequest = {
        model,
        messages: messagesToSend,
        stream,
      };

      let usedServer: Server | undefined;
      const onServer = (server: Server) => {
        usedServer = server;
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
        >(
          "/api/chat",
          "post",
          payload,
          "json",
          signal,
          stop.queueStatus,
          onServer,
        );
        const responseText =
          response?.message?.content || "(No response from Ollama)";

        saveReply(responseText);

        await replySplitInteraction(
          interaction,
          responseText,
          true,
          statsComponents(
            response && (await withLoadedContext(response, usedServer)),
          ),
        );
      } else {
        const responseStream = await makeRequest<
          NodeJS.ReadableStream,
          OllamaChatRequest
        >(
          "/api/chat",
          "post",
          payload,
          "stream",
          signal,
          stop.queueStatus,
          onServer,
        );

        stoppedPartway = await handleStreamResponse<OllamaChatResponse>(
          interaction,
          responseStream,
          saveReply,
          stop.signal,
          (stats) => withLoadedContext(stats, usedServer),
        );
      }
    } catch (error) {
      if (stop.signal.aborted) {
        await interaction.editReply({ content: "Stopped." });
      } else if (pending.signal.aborted) {
        await interaction.editReply({
          content: "Cancelled because your conversation history was cleared.",
        });
      } else if (error instanceof ServersBusyError) {
        cancelSlowmode(userID);
        await interaction.editReply({
          content: BUSY_MESSAGE,
          components: [],
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
      finishSlowmode(userID);
      await stop.finish(stoppedPartway);
    }
  },
};

export default chat;
