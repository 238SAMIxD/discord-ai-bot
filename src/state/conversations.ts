export interface ChatHistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface StoredMessage extends ChatHistoryMessage {
  turn: number;
}

interface UserHistory {
  messages: StoredMessage[];
  clearedAtTurn: number;
}

const MAX_CHAT_HISTORY = 50;
const MAX_CHAT_HISTORIES = 1000;

let lastTurn = 0;
const chatHistory = new Map<string, UserHistory>();

function historyKey(channelId: string, userId: string): string {
  return `${channelId}:${userId}`;
}

function storeHistory(key: string, history: UserHistory): void {
  chatHistory.delete(key);
  chatHistory.set(key, history);
  if (chatHistory.size > MAX_CHAT_HISTORIES) {
    const [leastRecentKey] = chatHistory.keys();
    chatHistory.delete(leastRecentKey);
  }
}

export function startTurn(): number {
  lastTurn += 1;
  return lastTurn;
}

export function getUserHistory(
  channelId: string,
  userId: string,
): ChatHistoryMessage[] {
  const history = chatHistory.get(historyKey(channelId, userId));
  return (history?.messages ?? []).map(({ role, content }) => ({
    role,
    content,
  }));
}

export function addToUserHistory(
  channelId: string,
  userId: string,
  turn: number,
  ...messages: ChatHistoryMessage[]
): void {
  const key = historyKey(channelId, userId);
  const history = chatHistory.get(key) ?? { messages: [], clearedAtTurn: 0 };
  if (turn <= history.clearedAtTurn) return;

  let index = history.messages.length;
  while (index > 0 && history.messages[index - 1].turn > turn) {
    index -= 1;
  }
  history.messages.splice(
    index,
    0,
    ...messages.map((message) => ({ ...message, turn })),
  );
  if (history.messages.length > MAX_CHAT_HISTORY) {
    history.messages.splice(0, history.messages.length - MAX_CHAT_HISTORY);
  }
  storeHistory(key, history);
}

export function clearUserHistory(channelId: string, userId: string): void {
  storeHistory(historyKey(channelId, userId), {
    messages: [],
    clearedAtTurn: startTurn(),
  });
}

export function getUserStats(
  channelId: string,
  userId: string,
): { chats: number } {
  const chats =
    chatHistory.get(historyKey(channelId, userId))?.messages.length ?? 0;
  return { chats };
}
