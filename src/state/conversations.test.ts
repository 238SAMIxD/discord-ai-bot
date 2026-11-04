import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addToUserHistory,
  clearUserHistory,
  closeChatHistory,
  getUserHistory,
  getUserStats,
  openChatHistory,
  startTurn,
} from "./conversations.js";

import type { ChatHistoryMessage } from "./conversations.js";

let tempDir: string;
let dbPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "chat-history-"));
  dbPath = join(tempDir, "data", "chat-history.db");
  openChatHistory(dbPath);
});

afterEach(() => {
  closeChatHistory();
  rmSync(tempDir, { recursive: true, force: true });
});

function exchange(prompt: string, reply: string): ChatHistoryMessage[] {
  return [
    { role: "user", content: prompt },
    { role: "assistant", content: reply },
  ];
}

function userMessages(
  label: string,
  from: number,
  to: number,
): ChatHistoryMessage[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({
    role: "user",
    content: `${label} ${from + i}`,
  }));
}

function addMessage(channelId: string, userId: string, content: string) {
  addToUserHistory(channelId, userId, startTurn(), { role: "user", content });
}

test("openChatHistory creates the database file and its missing directory", () => {
  assert.ok(existsSync(dbPath));
});

test("getUserHistory returns history saved before the database was reopened", () => {
  addToUserHistory(
    "111",
    "alice",
    startTurn(),
    ...exchange("Remember 42", "Noted: 42"),
  );

  closeChatHistory();
  openChatHistory(dbPath);

  assert.deepEqual(
    getUserHistory("111", "alice"),
    exchange("Remember 42", "Noted: 42"),
  );
  assert.deepEqual(getUserStats("111", "alice"), { chats: 2 });
});

test("getUserHistory keeps separate histories for users in the same channel", () => {
  addToUserHistory(
    "111",
    "alice",
    startTurn(),
    ...exchange("Hi from Alice", "Hi, Alice"),
  );
  addMessage("111", "bob", "Hi from Bob");

  assert.deepEqual(
    getUserHistory("111", "alice"),
    exchange("Hi from Alice", "Hi, Alice"),
  );
  assert.deepEqual(getUserHistory("111", "bob"), [
    { role: "user", content: "Hi from Bob" },
  ]);
  assert.deepEqual(getUserStats("111", "alice"), { chats: 2 });
  assert.deepEqual(getUserStats("111", "bob"), { chats: 1 });
});

test("getUserHistory keeps a separate history for a user in each channel", () => {
  addMessage("111", "alice", "In 111");
  addMessage("222", "alice", "In 222");

  assert.deepEqual(getUserHistory("111", "alice"), [
    { role: "user", content: "In 111" },
  ]);
  assert.deepEqual(getUserHistory("222", "alice"), [
    { role: "user", content: "In 222" },
  ]);
});

test("clearUserHistory leaves other users' histories untouched", () => {
  addMessage("111", "alice", "Alice in 111");
  addMessage("111", "bob", "Bob in 111");
  addMessage("222", "alice", "Alice in 222");

  clearUserHistory("111", "alice");

  assert.deepEqual(getUserHistory("111", "alice"), []);
  assert.deepEqual(getUserStats("111", "alice"), { chats: 0 });
  assert.deepEqual(getUserHistory("111", "bob"), [
    { role: "user", content: "Bob in 111" },
  ]);
  assert.deepEqual(getUserHistory("222", "alice"), [
    { role: "user", content: "Alice in 222" },
  ]);
});

test("addToUserHistory caps each user's history at the newest 50 messages", () => {
  for (let i = 1; i <= 60; i++) {
    addMessage("111", "alice", `alice ${i}`);
    if (i <= 30) {
      addMessage("111", "bob", `bob ${i}`);
    }
  }

  assert.deepEqual(
    getUserHistory("111", "alice"),
    userMessages("alice", 11, 60),
  );
  assert.deepEqual(getUserHistory("111", "bob"), userMessages("bob", 1, 30));
  assert.deepEqual(getUserStats("111", "alice"), { chats: 50 });
  assert.deepEqual(getUserStats("111", "bob"), { chats: 30 });
});

test("getUserHistory returns roles, content and order intact, oldest first", () => {
  const tricky = `It's "quoted"\nwith 😀 and '); DROP TABLE messages; --`;
  addToUserHistory("111", "alice", startTurn(), {
    role: "system",
    content: "Be brief.",
  });
  addToUserHistory(
    "111",
    "alice",
    startTurn(),
    ...exchange("First question", "First"),
  );
  addToUserHistory("111", "alice", startTurn(), ...exchange(tricky, "Second"));

  assert.deepEqual(getUserHistory("111", "alice"), [
    { role: "system", content: "Be brief." },
    { role: "user", content: "First question" },
    { role: "assistant", content: "First" },
    { role: "user", content: tricky },
    { role: "assistant", content: "Second" },
  ]);
});

test("addToUserHistory rolls back the whole call when one message fails", () => {
  addToUserHistory(
    "111",
    "alice",
    startTurn(),
    ...exchange("Kept question", "Kept"),
  );
  const invalid = {
    role: "narrator",
    content: "Lost answer",
  } as unknown as ChatHistoryMessage;

  assert.throws(
    () =>
      addToUserHistory(
        "111",
        "alice",
        startTurn(),
        { role: "user", content: "Lost question" },
        invalid,
      ),
    /CHECK constraint failed/,
  );

  assert.deepEqual(
    getUserHistory("111", "alice"),
    exchange("Kept question", "Kept"),
  );
  addToUserHistory(
    "111",
    "alice",
    startTurn(),
    ...exchange("Next question", "Next"),
  );
  assert.deepEqual(getUserStats("111", "alice"), { chats: 4 });
});

test("startTurn returns a larger number on every call", () => {
  const turns = Array.from({ length: 100 }, () => startTurn());

  for (let i = 1; i < turns.length; i++) {
    assert.ok(turns[i] > turns[i - 1]);
  }
});

test("addToUserHistory keeps exchanges in the order their turns started", () => {
  const first = startTurn();
  const second = startTurn();
  addToUserHistory(
    "111",
    "alice",
    second,
    ...exchange("Second question", "Second answer"),
  );
  addToUserHistory(
    "111",
    "alice",
    first,
    ...exchange("First question", "First answer"),
  );

  assert.deepEqual(getUserHistory("111", "alice"), [
    ...exchange("First question", "First answer"),
    ...exchange("Second question", "Second answer"),
  ]);
});

test("addToUserHistory trims by turn, so a late exchange older than a full history is dropped", () => {
  const late = startTurn();
  for (let i = 1; i <= 25; i++) {
    addToUserHistory(
      "111",
      "alice",
      startTurn(),
      ...exchange(`q${i}`, `a${i}`),
    );
  }

  addToUserHistory(
    "111",
    "alice",
    late,
    ...exchange("Late question", "Late answer"),
  );

  const history = getUserHistory("111", "alice");
  assert.equal(history.length, 50);
  assert.deepEqual(history.slice(0, 2), exchange("q1", "a1"));
  assert.deepEqual(history.at(-1), { role: "assistant", content: "a25" });
});

test("addToUserHistory skips an exchange that started before the history was cleared", () => {
  const stale = startTurn();
  clearUserHistory("111", "alice");
  addToUserHistory(
    "111",
    "alice",
    stale,
    ...exchange("Old question", "Old answer"),
  );

  assert.deepEqual(getUserHistory("111", "alice"), []);

  addToUserHistory(
    "111",
    "alice",
    startTurn(),
    ...exchange("New question", "New answer"),
  );
  assert.deepEqual(
    getUserHistory("111", "alice"),
    exchange("New question", "New answer"),
  );
});
