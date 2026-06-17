import type { ChannelMessages, OllamaShowResponse } from "../types.js";

export interface ChatHistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const MAX_CHAT_HISTORY = 50;

const messages: { [channelId: string]: ChannelMessages } = {};

const chatHistory: { [channelId: string]: ChatHistoryMessage[] } = {};

let modelInfo: OllamaShowResponse | null = null;

export function setModelInfo(info: OllamaShowResponse): void {
  modelInfo = info;
}

export function getModelInfo(): OllamaShowResponse | null {
  return modelInfo;
}

export function getMessages(channelId: string): ChannelMessages | undefined {
  return messages[channelId];
}

export function setMessages(channelId: string, data: ChannelMessages): void {
  messages[channelId] = data;
}

export function getChatHistory(channelId: string): ChatHistoryMessage[] {
  return chatHistory[channelId] ?? [];
}

export function addChatMessage(channelId: string, msg: ChatHistoryMessage): void {
  if (!chatHistory[channelId]) chatHistory[channelId] = [];
  chatHistory[channelId].push(msg);
  if (chatHistory[channelId].length > MAX_CHAT_HISTORY) {
    chatHistory[channelId].splice(0, chatHistory[channelId].length - MAX_CHAT_HISTORY);
  }
}

export function clearChannelState(channelId: string): void {
  delete chatHistory[channelId];
  delete messages[channelId];
}

export function getChannelStats(channelId: string): { generations: number; chats: number } {
  const generations = messages[channelId] ? messages[channelId].amount : 0;
  const chats = chatHistory[channelId] ? chatHistory[channelId].length : 0;
  return { generations, chats };
}
