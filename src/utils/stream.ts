import { finished } from "node:stream/promises";
import { ChatInputCommandInteraction, Message } from "discord.js";
import { logError } from "./logger.js";
import { replySplitInteraction, splitText } from "./helpers.js";
import { statsComponents } from "./stats.js";

import type { OllamaStats } from "../types.js";

/**
 * Handles an Ollama streaming response, throttling Discord message edits
 * and updating the chat history.
 */
export async function handleStreamResponse<
  T extends OllamaStats & {
    done?: boolean;
    message?: { content?: string };
    response?: string;
  },
>(
  interaction: ChatInputCommandInteraction,
  responseStream: NodeJS.ReadableStream,
  onComplete: (fullText: string) => void | Promise<void>,
  stopSignal?: AbortSignal,
): Promise<boolean> {
  const streamState = {
    fullResponse: "",
    buffer: "",
    lastEditTime: Date.now(),
    editPromise: Promise.resolve() as Promise<Message | void>,
    stats: undefined as OllamaStats | undefined,
  };

  let isEditing = false;
  let pendingEdit = false;
  let ended = false;

  const updateMessage = async (force = false) => {
    if (ended) return;
    if (isEditing) {
      pendingEdit = true;
      return;
    }
    const now = Date.now();
    if (force || now - streamState.lastEditTime >= 1000) {
      streamState.lastEditTime = now;
      isEditing = true;
      try {
        const cleanText = streamState.fullResponse.trim();
        if (cleanText.length > 0) {
          const segments = splitText(cleanText, 2000);
          streamState.editPromise = interaction.editReply(segments[0]);
          await streamState.editPromise;
        }
      } catch {
        // Ignore minor edit/rate limit errors during streaming
      } finally {
        isEditing = false;
        if (pendingEdit) {
          pendingEdit = false;
          void updateMessage(true);
        }
      }
    }
  };

  const readLine = (line: string) => {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) return;
    try {
      const parsedData = JSON.parse(trimmedLine) as T;
      const text = parsedData.message?.content || parsedData.response || "";
      streamState.fullResponse += text;
      if (parsedData.done) streamState.stats = parsedData;
    } catch {
      // Partial JSON line or parse error
    }
  };

  responseStream.on("data", (chunk: Buffer) => {
    streamState.buffer += chunk.toString();
    const lines = streamState.buffer.split("\n");
    streamState.buffer = lines.pop() ?? "";
    lines.forEach(readLine);
    void updateMessage();
  });

  const failure = await finished(responseStream).then(
    () => undefined,
    (error: unknown) => ({ error }),
  );
  ended = true;
  readLine(streamState.buffer);

  const stopped =
    failure !== undefined &&
    stopSignal?.aborted === true &&
    streamState.fullResponse.trim().length > 0;
  if (failure && !stopped) {
    await streamState.editPromise.catch(() => undefined);
    throw failure.error;
  }

  const cleanText = streamState.fullResponse.trim() || "(No response)";
  if (!stopped) await onComplete(cleanText);
  await streamState.editPromise.catch(() => undefined);

  try {
    await replySplitInteraction(
      interaction,
      cleanText,
      true,
      statsComponents(stopped ? undefined : streamState.stats),
    );
  } catch (err) {
    logError(err);
  }

  return stopped;
}
