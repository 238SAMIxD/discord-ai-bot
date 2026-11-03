import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { clearConfigCache, getConfig } from "../config.js";
import { isChannelAllowed } from "./channels.js";

import type { BaseInteraction } from "discord.js";

interface FakeChannel {
  parentId: string | null;
  isThread(): boolean;
}

interface FakeInteractionOptions {
  channelId: string;
  channel?: FakeChannel | null;
  inGuild?: boolean;
  fetch?: (id: string) => Promise<FakeChannel | null>;
}

process.env.TOKEN = "test-token";
process.env.OLLAMA = "http://localhost:11434";

function setChannels(value: string) {
  process.env.CHANNELS = value;
  clearConfigCache();
}

function textChannel(): FakeChannel {
  return { parentId: null, isThread: () => false };
}

function thread(parentId: string): FakeChannel {
  return { parentId, isThread: () => true };
}

function fakeInteraction({
  channelId,
  channel = textChannel(),
  inGuild = true,
  fetch = async () => null,
}: FakeInteractionOptions): BaseInteraction {
  return {
    channelId,
    channel,
    inGuild: () => inGuild,
    client: { channels: { fetch } },
  } as unknown as BaseInteraction;
}

test("isChannelAllowed allows every channel when CHANNELS is empty", async () => {
  setChannels("");
  const interaction = fakeInteraction({ channelId: "999" });
  assert.equal(await isChannelAllowed(interaction), true);
});

test("isChannelAllowed allows a listed channel", async () => {
  setChannels("111,222");
  const interaction = fakeInteraction({ channelId: "222" });
  assert.equal(await isChannelAllowed(interaction), true);
});

test("isChannelAllowed blocks a channel that is not listed", async () => {
  setChannels("111,222");
  const interaction = fakeInteraction({ channelId: "333" });
  assert.equal(await isChannelAllowed(interaction), false);
});

test("isChannelAllowed always allows DMs", async () => {
  setChannels("111,222");
  const interaction = fakeInteraction({ channelId: "333", inGuild: false });
  assert.equal(await isChannelAllowed(interaction), true);
});

test("isChannelAllowed allows a thread under a listed channel", async () => {
  setChannels("111,222");
  const interaction = fakeInteraction({
    channelId: "333",
    channel: thread("111"),
  });
  assert.equal(await isChannelAllowed(interaction), true);
});

test("isChannelAllowed blocks a thread under a channel that is not listed", async () => {
  setChannels("111,222");
  const interaction = fakeInteraction({
    channelId: "333",
    channel: thread("444"),
  });
  assert.equal(await isChannelAllowed(interaction), false);
});

test("isChannelAllowed fetches an uncached channel to check its parent", async () => {
  setChannels("111,222");
  const fetch = mock.fn(async () => thread("111"));
  const interaction = fakeInteraction({
    channelId: "333",
    channel: null,
    fetch,
  });
  assert.equal(await isChannelAllowed(interaction), true);
  assert.deepEqual(fetch.mock.calls[0]?.arguments, ["333"]);
});

test("isChannelAllowed blocks an uncached channel it cannot fetch", async () => {
  setChannels("111,222");
  const missing = fakeInteraction({ channelId: "333", channel: null });
  const failing = fakeInteraction({
    channelId: "333",
    channel: null,
    fetch: async () => {
      throw new Error("Missing Access");
    },
  });
  assert.equal(await isChannelAllowed(missing), false);
  assert.equal(await isChannelAllowed(failing), false);
});

test("isChannelAllowed matches IDs with surrounding spaces in CHANNELS", async () => {
  setChannels(" 111 ,, 222 , ");
  assert.deepEqual(getConfig().channels, ["111", "222"]);
  const interaction = fakeInteraction({ channelId: "222" });
  assert.equal(await isChannelAllowed(interaction), true);
});
