export interface ChatHistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const MAX_CHAT_HISTORY = 50;

const chatHistory = new Map<string, ChatHistoryMessage[]>();

function historyKey(channelId: string, userId: string): string {
  return `${channelId}:${userId}`;
}

export function getUserHistory(
  channelId: string,
  userId: string,
): ChatHistoryMessage[] {
  return chatHistory.get(historyKey(channelId, userId)) ?? [];
}

export function addToUserHistory(
  channelId: string,
  userId: string,
  msg: ChatHistoryMessage,
): void {
  const key = historyKey(channelId, userId);
  const history = chatHistory.get(key) ?? [];
  history.push(msg);
  if (history.length > MAX_CHAT_HISTORY) {
    history.splice(0, history.length - MAX_CHAT_HISTORY);
  }
  chatHistory.set(key, history);
}

export function clearUserHistory(channelId: string, userId: string): void {
  chatHistory.delete(historyKey(channelId, userId));
}

export function getUserStats(
  channelId: string,
  userId: string,
): { chats: number } {
  const chats = chatHistory.get(historyKey(channelId, userId))?.length ?? 0;
  return { chats };
}
