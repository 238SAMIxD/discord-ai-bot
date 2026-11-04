import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { clearConfigCache } from "../config.js";
import { buildSystemMessage } from "../api/ollama.js";
import {
  buildBotContext,
  formatBotContext,
  getBotProfile,
  resetBotProfileCache,
} from "./botContext.js";
import { Logger, setLogger } from "./logger.js";

import type { BaseInteraction, Client } from "discord.js";

setLogger(new Logger(true, "botContext.test"));
process.env.TOKEN = "test-token";
process.env.OLLAMA = "http://127.0.0.1:9";
process.env.USE_MODEL_SYSTEM = "false";

const now = new Date("2026-11-04T12:00:00Z");

beforeEach(() => {
  delete process.env.USE_BOT_CONTEXT;
  process.env.USE_SYSTEM = "false";
  clearConfigCache();
  resetBotProfileCache();
});

function fakeClient(
  options: {
    description?: () => Promise<string | null>;
    banner?: () => Promise<string | null>;
  } = {},
) {
  const calls = { application: 0, user: 0 };
  const user = {
    username: "helper",
    displayName: "Helper Bot",
    displayAvatarURL: () => "https://cdn.example/avatar.png",
    async fetch() {
      calls.user++;
      const banner = await (options.banner ?? (async () => null))();
      return { bannerURL: () => banner };
    },
  };
  const client = {
    user,
    application: {
      async fetch() {
        calls.application++;
        const description = await (
          options.description ?? (async () => "A helpful bot")
        )();
        return { description };
      },
    },
  } as unknown as Client;
  return { client, calls };
}

function fakeInteraction(client: Client, inGuild = true): BaseInteraction {
  return {
    client,
    user: { displayName: "Alice" },
    member: inGuild ? { nick: "Captain Alice" } : null,
    guild: inGuild
      ? { name: "Test Server", members: { me: { displayName: "Helpy" } } }
      : null,
    channel: inGuild
      ? { name: "general", topic: "Chat about anything" }
      : { type: 1 },
  } as unknown as BaseInteraction;
}

test("formatBotContext includes every available field", () => {
  assert.equal(
    formatBotContext({
      displayName: "Helpy",
      username: "helper",
      description: "A helpful bot",
      avatarURL: "https://cdn.example/avatar.png",
      bannerURL: "https://cdn.example/banner.png",
      guildName: "Test Server",
      channelName: "general",
      channelTopic: "Chat about anything",
      requester: "Captain Alice",
      now,
    }),
    [
      "You are Helpy (@helper), a Discord bot.",
      "About you: A helpful bot",
      "Your avatar: https://cdn.example/avatar.png",
      "Your banner: https://cdn.example/banner.png",
      'You are in the server "Test Server", channel #general (topic: Chat about anything).',
      "You were asked by Captain Alice.",
      `The current date and time is ${now.toUTCString()}.`,
    ].join("\n"),
  );
});

test("formatBotContext skips missing fields and describes a DM", () => {
  assert.equal(
    formatBotContext({ displayName: "helper", username: "helper", now }),
    [
      "You are @helper, a Discord bot.",
      "You are in a direct message.",
      `The current date and time is ${now.toUTCString()}.`,
    ].join("\n"),
  );
});

test("buildBotContext returns nothing when USE_BOT_CONTEXT is false", async () => {
  process.env.USE_BOT_CONTEXT = "false";
  const { client, calls } = fakeClient();
  assert.equal(await buildBotContext(fakeInteraction(client)), "");
  assert.deepEqual(calls, { application: 0, user: 0 });
});

test("buildBotContext uses the server nickname, channel and requester", async () => {
  const { client } = fakeClient({
    banner: async () => "https://cdn.example/banner.png",
  });
  const context = await buildBotContext(fakeInteraction(client));
  assert.match(context, /^You are Helpy \(@helper\), a Discord bot\.$/m);
  assert.match(context, /^About you: A helpful bot$/m);
  assert.match(context, /^Your banner: https:\/\/cdn\.example\/banner\.png$/m);
  assert.match(context, /channel #general \(topic: Chat about anything\)/);
  assert.match(context, /^You were asked by Captain Alice\.$/m);
});

test("buildBotContext falls back to the global display name in DMs", async () => {
  const { client } = fakeClient();
  const context = await buildBotContext(fakeInteraction(client, false));
  assert.match(context, /^You are Helper Bot \(@helper\), a Discord bot\.$/m);
  assert.match(context, /^You are in a direct message\.$/m);
  assert.match(context, /^You were asked by Alice\.$/m);
});

test("getBotProfile keeps a fetched field and retries only the failed one", async () => {
  let bannerFails = true;
  const { client, calls } = fakeClient({
    banner: async () => {
      if (bannerFails) throw new Error("rate limited");
      return "https://cdn.example/banner.png";
    },
  });

  assert.deepEqual(await getBotProfile(client), {
    description: "A helpful bot",
    bannerURL: null,
  });

  bannerFails = false;
  assert.deepEqual(await getBotProfile(client), {
    description: "A helpful bot",
    bannerURL: "https://cdn.example/banner.png",
  });
  assert.deepEqual(calls, { application: 1, user: 2 });

  await getBotProfile(client);
  assert.deepEqual(calls, { application: 1, user: 2 });
});

test("buildSystemMessage puts the bot context before the custom system message", async () => {
  process.env.USE_SYSTEM = "true";
  process.env.SYSTEM = "Be brief.";
  try {
    assert.equal(
      await buildSystemMessage("model", undefined, "You are @helper."),
      "You are @helper.\n\nBe brief.",
    );
    assert.equal(await buildSystemMessage("model"), "Be brief.");
  } finally {
    delete process.env.SYSTEM;
  }
});
