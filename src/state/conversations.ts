import type { ChannelMessages, OllamaShowResponse } from "../types.js";

export interface ChatHistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export const messages: Record<string, ChannelMessages> = {};

export const chatHistory: Record<string, ChatHistoryMessage[]> = {};

export let modelInfo: OllamaShowResponse | null = null;

export function setModelInfo(info: OllamaShowResponse) {
  modelInfo = info;
}
