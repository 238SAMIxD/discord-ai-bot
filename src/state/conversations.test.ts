import test from "node:test";
import assert from "node:assert/strict";
import {
  addToUserHistory,
  clearUserHistory,
  getUserHistory,
  getUserStats,
  startTurn,
} from "./conversations.js";

import type { ChatHistoryMessage } from "./conversations.js";

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

test("getUserHistory keeps separate histories for users in the same channel", () => {
  addToUserHistory(
    "111",
    "alice",
    startTurn(),
    ...exchange("Hi from Alice", "Hello, Alice"),
  );
  addToUserHistory("111", "bob", startTurn(), {
    role: "user",
    content: "Hi from Bob",
  });

  assert.deepEqual(
    getUserHistory("111", "alice"),
    exchange("Hi from Alice", "Hello, Alice"),
  );
  assert.deepEqual(getUserHistory("111", "bob"), [
    { role: "user", content: "Hi from Bob" },
  ]);
  assert.deepEqual(getUserStats("111", "alice"), { chats: 2 });
  assert.deepEqual(getUserStats("111", "bob"), { chats: 1 });
});

test("getUserHistory keeps a separate history for a user in each channel", () => {
  addToUserHistory("221", "alice", startTurn(), {
    role: "user",
    content: "In 221",
  });
  addToUserHistory("222", "alice", startTurn(), {
    role: "user",
    content: "In 222",
  });

  assert.deepEqual(getUserHistory("221", "alice"), [
    { role: "user", content: "In 221" },
  ]);
  assert.deepEqual(getUserHistory("222", "alice"), [
    { role: "user", content: "In 222" },
  ]);
});

test("clearUserHistory leaves other users' histories untouched", () => {
  addToUserHistory("333", "alice", startTurn(), {
    role: "user",
    content: "Alice in 333",
  });
  addToUserHistory("333", "bob", startTurn(), {
    role: "user",
    content: "Bob in 333",
  });
  addToUserHistory("334", "alice", startTurn(), {
    role: "user",
    content: "Alice in 334",
  });

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
    addToUserHistory("444", "alice", startTurn(), {
      role: "user",
      content: `alice ${i}`,
    });
    if (i <= 30) {
      addToUserHistory("444", "bob", startTurn(), {
        role: "user",
        content: `bob ${i}`,
      });
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

test("addToUserHistory keeps exchanges in the order their turns started", () => {
  const first = startTurn();
  const second = startTurn();
  addToUserHistory(
    "555",
    "alice",
    second,
    ...exchange("Second question", "Second answer"),
  );
  addToUserHistory(
    "555",
    "alice",
    first,
    ...exchange("First question", "First answer"),
  );

  assert.deepEqual(getUserHistory("555", "alice"), [
    ...exchange("First question", "First answer"),
    ...exchange("Second question", "Second answer"),
  ]);
});

test("addToUserHistory skips an exchange that started before the history was cleared", () => {
  const stale = startTurn();
  clearUserHistory("666", "alice");
  addToUserHistory(
    "666",
    "alice",
    stale,
    ...exchange("Old question", "Old answer"),
  );

  assert.deepEqual(getUserHistory("666", "alice"), []);

  addToUserHistory(
    "666",
    "alice",
    startTurn(),
    ...exchange("New question", "New answer"),
  );
  assert.deepEqual(
    getUserHistory("666", "alice"),
    exchange("New question", "New answer"),
  );
});

test("addToUserHistory evicts the least recently updated history beyond 1000", () => {
  for (let i = 0; i < 1000; i++) {
    addToUserHistory("777", `user-${i}`, startTurn(), {
      role: "user",
      content: `Hi ${i}`,
    });
  }
  addToUserHistory("777", "user-0", startTurn(), {
    role: "user",
    content: "Still here",
  });
  addToUserHistory("777", "newcomer", startTurn(), {
    role: "user",
    content: "Hello",
  });

  assert.deepEqual(getUserStats("777", "user-1"), { chats: 0 });
  assert.deepEqual(getUserStats("777", "user-0"), { chats: 2 });
  assert.deepEqual(getUserStats("777", "user-2"), { chats: 1 });
  assert.deepEqual(getUserStats("777", "newcomer"), { chats: 1 });
});
