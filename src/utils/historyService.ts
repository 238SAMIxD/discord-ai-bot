import { LogLevel } from "meklog";

import { log } from "../bot";

export interface HistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface UserHistory {
  userId: string;
  messages: HistoryMessage[];
}

class HistoryService {
  private historyMap: Map<string, HistoryMessage[]>;

  constructor() {
    this.historyMap = new Map<string, HistoryMessage[]>();
  }

  public getUserHistory(userId: string): HistoryMessage[] {
    if (!this.historyMap.has(userId)) {
      this.historyMap.set(userId, []);
    }
    return this.historyMap.get(userId) || [];
  }

  public addMessage(userId: string, message: HistoryMessage): void {
    const history = this.getUserHistory(userId);
    history.push(message);
    this.historyMap.set(userId, history);
  }

  public addMessages(userId: string, messages: HistoryMessage[]): void {
    const history = this.getUserHistory(userId);
    this.historyMap.set(userId, [...history, ...messages]);
  }

  public clearHistory(userId: string): void {
    this.historyMap.set(userId, []);
    log(LogLevel.Info, `Cleared history for user ${userId}`);
  }

  public hasHistory(userId: string): boolean {
    return this.historyMap.has(userId) && this.historyMap.get(userId)!.length > 0;
  }
}

export const historyService = new HistoryService();
