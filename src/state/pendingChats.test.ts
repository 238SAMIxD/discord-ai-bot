import test from "node:test";
import assert from "node:assert/strict";
import {
  addPendingChat,
  cancelPendingChats,
  removePendingChat,
} from "./pendingChats.js";

test("cancelPendingChats aborts only that user's chats in that channel", () => {
  const first = addPendingChat("111", "1");
  const second = addPendingChat("111", "1");
  const otherUser = addPendingChat("111", "2");
  const otherChannel = addPendingChat("222", "1");

  assert.equal(cancelPendingChats("111", "1"), 2);
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, true);
  assert.equal(otherUser.signal.aborted, false);
  assert.equal(otherChannel.signal.aborted, false);
  assert.equal(cancelPendingChats("111", "1"), 0);
});

test("removePendingChat keeps a finished chat from being cancelled", () => {
  const finished = addPendingChat("333", "1");
  const running = addPendingChat("333", "1");

  removePendingChat("333", "1", finished);

  assert.equal(cancelPendingChats("333", "1"), 1);
  assert.equal(finished.signal.aborted, false);
  assert.equal(running.signal.aborted, true);
});
