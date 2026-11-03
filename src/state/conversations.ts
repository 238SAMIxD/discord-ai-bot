export interface ChatHistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const MAX_CHAT_HISTORY = 50;

const chatHistory: { [channelId: string]: ChatHistoryMessage[] } = {};

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
}

export function getChannelStats(channelId: string): { chats: number } {
  const chats = chatHistory[channelId] ? chatHistory[channelId].length : 0;
  return { chats };
}
