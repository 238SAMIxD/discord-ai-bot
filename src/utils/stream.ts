import { ChatInputCommandInteraction, Message } from "discord.js";
import { logError } from "./logger.js";
import { splitText } from "./helpers.js";

/**
 * Handles an Ollama streaming response, throttling Discord message edits
 * and updating the chat history.
 */
export function handleStreamResponse<T extends { message?: { content?: string }; response?: string }>(
  interaction: ChatInputCommandInteraction,
  responseStream: NodeJS.ReadableStream,
  onComplete: (fullText: string) => void | Promise<void>,
) {
  const streamState = {
    fullResponse: "",
    buffer: "",
    lastEditTime: Date.now(),
    editPromise: Promise.resolve() as Promise<Message | void>,
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
        const parsedData = JSON.parse(trimmedLine) as T;
        const text = parsedData.message?.content || parsedData.response || "";
        streamState.fullResponse += text;
      } catch {
        // Partial JSON line or parse error
      }
    }
    void updateMessage();
  });

  responseStream.on("end", async () => {
    if (streamState.buffer.trim().length > 0) {
      try {
        const parsedData = JSON.parse(streamState.buffer.trim()) as T;
        const text = parsedData.message?.content || parsedData.response || "";
        streamState.fullResponse += text;
      } catch {
        // Ignore
      }
    }

    await updateMessage(true);
    const cleanText = streamState.fullResponse.trim() || "(No response)";

    await onComplete(cleanText);

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

  responseStream.on("error", (err: Error) => {
    logError(err);
    void interaction.editReply({
      content: "Error occurred while streaming response.",
    });
  });
}
