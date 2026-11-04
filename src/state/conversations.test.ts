import test from "node:test";
import assert from "node:assert/strict";
import {
  addToUserHistory,
  clearUserHistory,
  getUserHistory,
  getUserStats,
} from "./conversations.js";

import type { ChatHistoryMessage } from "./conversations.js";

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

test("getUserHistory keeps separate histories for users in the same channel", () => {
  addToUserHistory("111", "alice", { role: "user", content: "Hi from Alice" });
  addToUserHistory("111", "alice", {
    role: "assistant",
    content: "Hello, Alice",
  });
  addToUserHistory("111", "bob", { role: "user", content: "Hi from Bob" });

  assert.deepEqual(getUserHistory("111", "alice"), [
    { role: "user", content: "Hi from Alice" },
    { role: "assistant", content: "Hello, Alice" },
  ]);
  assert.deepEqual(getUserHistory("111", "bob"), [
    { role: "user", content: "Hi from Bob" },
  ]);
  assert.deepEqual(getUserStats("111", "alice"), { chats: 2 });
  assert.deepEqual(getUserStats("111", "bob"), { chats: 1 });
});

test("getUserHistory keeps a separate history for a user in each channel", () => {
  addToUserHistory("221", "alice", { role: "user", content: "In 221" });
  addToUserHistory("222", "alice", { role: "user", content: "In 222" });

  assert.deepEqual(getUserHistory("221", "alice"), [
    { role: "user", content: "In 221" },
  ]);
  assert.deepEqual(getUserHistory("222", "alice"), [
    { role: "user", content: "In 222" },
  ]);
});

test("clearUserHistory leaves other users' histories untouched", () => {
  addToUserHistory("333", "alice", { role: "user", content: "Alice in 333" });
  addToUserHistory("333", "bob", { role: "user", content: "Bob in 333" });
  addToUserHistory("334", "alice", { role: "user", content: "Alice in 334" });

  clearUserHistory("333", "alice");

  assert.deepEqual(getUserHistory("333", "alice"), []);
  assert.deepEqual(getUserStats("333", "alice"), { chats: 0 });
  assert.deepEqual(getUserHistory("333", "bob"), [
    { role: "user", content: "Bob in 333" },
  ]);
  assert.deepEqual(getUserHistory("334", "alice"), [
    { role: "user", content: "Alice in 334" },
  ]);
});

test("addToUserHistory caps each user's history at 50 messages", () => {
  for (let i = 1; i <= 60; i++) {
    addToUserHistory("444", "alice", { role: "user", content: `alice ${i}` });
    if (i <= 30) {
      addToUserHistory("444", "bob", { role: "user", content: `bob ${i}` });
    }
  }

  assert.deepEqual(
    getUserHistory("444", "alice"),
    userMessages("alice", 11, 60),
  );
  assert.deepEqual(getUserHistory("444", "bob"), userMessages("bob", 1, 30));
  assert.deepEqual(getUserStats("444", "alice"), { chats: 50 });
  assert.deepEqual(getUserStats("444", "bob"), { chats: 30 });
});
