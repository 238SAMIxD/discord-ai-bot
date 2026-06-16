import type { ChannelMessages, OllamaShowResponse } from "../types.js";

export interface ChatHistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export const messages: { [channelId: string]: ChannelMessages } = {};

export const chatHistory: { [channelId: string]: ChatHistoryMessage[] } = {};

export let modelInfo: OllamaShowResponse | null = null;

export function setModelInfo(info: OllamaShowResponse) {
  modelInfo = info;
}
