import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { logError } from "../utils/logger.js";

import type { StatementSync } from "node:sqlite";

export interface ChatHistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const MAX_CHAT_HISTORY = 50;

interface ChatHistoryStore {
  db: DatabaseSync;
  selectHistory: StatementSync;
  selectClearedAt: StatementSync;
  insertMessage: StatementSync;
  trimHistory: StatementSync;
  deleteHistory: StatementSync;
  saveClearedAt: StatementSync;
  countHistory: StatementSync;
}

let store: ChatHistoryStore | null = null;
let lastTurn = 0;

export function openChatHistory(path: string): void {
  closeChatHistory();
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_channel_user
        ON messages (channel_id, user_id, id);
      CREATE TABLE IF NOT EXISTS history_clears (
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        cleared_at INTEGER NOT NULL,
        PRIMARY KEY (channel_id, user_id)
      );
    `);
    store = {
      db,
      selectHistory: db.prepare(`
        SELECT role, content FROM messages
        WHERE channel_id = ? AND user_id = ?
        ORDER BY created_at, id
      `),
      selectClearedAt: db.prepare(`
        SELECT cleared_at FROM history_clears
        WHERE channel_id = ? AND user_id = ?
      `),
      insertMessage: db.prepare(`
        INSERT INTO messages (channel_id, user_id, role, content, created_at)
        VALUES (?, ?, ?, ?, ?)
      `),
      trimHistory: db.prepare(`
        DELETE FROM messages
        WHERE id IN (
          SELECT id FROM messages
          WHERE channel_id = ? AND user_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT -1 OFFSET ?
        )
      `),
      deleteHistory: db.prepare(`
        DELETE FROM messages
        WHERE channel_id = ? AND user_id = ?
      `),
      saveClearedAt: db.prepare(`
        INSERT INTO history_clears (channel_id, user_id, cleared_at)
        VALUES (?, ?, ?)
        ON CONFLICT (channel_id, user_id)
        DO UPDATE SET cleared_at = excluded.cleared_at
      `),
      countHistory: db.prepare(`
        SELECT COUNT(*) AS count FROM messages
        WHERE channel_id = ? AND user_id = ?
      `),
    };
  } catch (error) {
    db.close();
    throw error;
  }
}

export function closeChatHistory(): void {
  store?.db.close();
  store = null;
}

function getStore(): ChatHistoryStore {
  if (!store) {
    throw new Error("The chat history database is not open");
  }
  return store;
}

function rollback(db: DatabaseSync): void {
  try {
    db.exec("ROLLBACK");
  } catch (error) {
    logError(error);
  }
}

function inTransaction(db: DatabaseSync, work: () => void): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    work();
    db.exec("COMMIT");
  } catch (error) {
    rollback(db);
    throw error;
  }
}

export function startTurn(): number {
  lastTurn = Math.max(Date.now(), lastTurn + 1);
  return lastTurn;
}

export function getUserHistory(
  channelId: string,
  userId: string,
): ChatHistoryMessage[] {
  return getStore()
    .selectHistory.all(channelId, userId)
    .map((row) => ({
      role: row.role as ChatHistoryMessage["role"],
      content: row.content as string,
    }));
}

export function addToUserHistory(
  channelId: string,
  userId: string,
  turn: number,
  ...messages: ChatHistoryMessage[]
): void {
  const { db, selectClearedAt, insertMessage, trimHistory } = getStore();
  inTransaction(db, () => {
    const cleared = selectClearedAt.get(channelId, userId);
    if (cleared && turn <= Number(cleared.cleared_at)) return;
    for (const { role, content } of messages) {
      insertMessage.run(channelId, userId, role, content, turn);
    }
    trimHistory.run(channelId, userId, MAX_CHAT_HISTORY);
  });
}

export function clearUserHistory(channelId: string, userId: string): void {
  const { db, deleteHistory, saveClearedAt } = getStore();
  inTransaction(db, () => {
    deleteHistory.run(channelId, userId);
    saveClearedAt.run(channelId, userId, startTurn());
  });
}

export function getUserStats(
  channelId: string,
  userId: string,
): { chats: number } {
  const row = getStore().countHistory.get(channelId, userId);
  return { chats: Number(row?.count ?? 0) };
}
