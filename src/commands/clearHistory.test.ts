import test, { after, before, mock, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { createServer } from "node:http";
import { text } from "node:stream/consumers";
import { setTimeout as delay } from "node:timers/promises";
import chat from "./chat.js";
import clearHistory from "./clearHistory.js";
import { clearConfigCache, getConfig } from "../config.js";
import {
  addToUserHistory,
  closeChatHistory,
  getUserHistory,
  openChatHistory,
  startTurn,
} from "../state/conversations.js";
import { Logger, setLogger } from "../utils/logger.js";

import type { AddressInfo } from "node:net";
import type { ChatInputCommandInteraction } from "discord.js";
import type { BotCommand, OllamaChatRequest } from "../types.js";

interface HeldChat {
  body: OllamaChatRequest;
  closed: Promise<unknown>;
  answer(content: string): void;
}

type FakeInteraction = ReturnType<typeof fakeInteraction>;

const USER = "1";
const CANCELLED = {
  content: "Cancelled because your conversation history was cleared.",
};
const options = { timeout: 5_000 };

setLogger(new Logger(true, "clearHistory.test"));
process.env.TOKEN = "test-token";
process.env.USE_SYSTEM = "false";
process.env.USE_BOT_CONTEXT = "false";
process.env.USE_MODEL_SYSTEM = "false";

before(() => openChatHistory(":memory:"));
after(() => closeChatHistory());

async function startFakeOllama(t: TestContext) {
  const received = new EventEmitter();
  const chats: HeldChat[] = [];

  const server = createServer(async (req, res) => {
    const body = JSON.parse(await text(req)) as OllamaChatRequest;
    const closed = once(res, "close");
    if (body.stream) {
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      res.write(
        JSON.stringify({ message: { content: "" }, done: false }) + "\n",
      );
    }

    const held: HeldChat = {
      body,
      closed,
      answer(content) {
        const chunk = JSON.stringify({
          message: { role: "assistant", content },
          done: true,
        });
        if (!body.stream) {
          res.writeHead(200, { "Content-Type": "application/json" });
        }
        res.end(body.stream ? chunk + "\n" : chunk);
      },
    };
    chats.push(held);
    received.emit("chat", held);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  process.env.OLLAMA = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  clearConfigCache();

  return {
    chats,
    nextChat: async () => (await once(received, "chat"))[0] as HeldChat,
  };
}

let interactionCount = 0;

function fakeInteraction(
  channelId: string,
  prompt = "",
  stream = false,
  userId = USER,
) {
  return {
    id: String(++interactionCount),
    channelId,
    user: { id: userId, displayName: `User ${userId}` },
    deferred: false,
    replied: false,
    options: {
      getString: (name: string) => (name === "prompt" ? prompt : null),
      getBoolean: (name: string) => (name === "stream" ? stream : null),
      getAttachment: () => null,
    },
    deferReply: mock.fn(async () => undefined),
    editReply: mock.fn(async (_reply: unknown) => ({})),
    followUp: mock.fn(async (_reply: unknown) => ({})),
  };
}

function run(command: BotCommand, interaction: FakeInteraction) {
  return command.execute(interaction as unknown as ChatInputCommandInteraction);
}

function lastReply(interaction: FakeInteraction) {
  return interaction.editReply.mock.calls
    .map((call) => call.arguments[0])
    .filter(
      (reply) =>
        typeof reply === "string" ||
        (reply as { content?: unknown }).content !== undefined,
    )
    .at(-1);
}

function isPending(promise: Promise<unknown>, ms: number) {
  return Promise.race([promise.then(() => false), delay(ms, true)]);
}

test(
  "clearhistory cancels a chat that is waiting for a free server",
  options,
  async (t) => {
    const ollama = await startFakeOllama(t);
    addToUserHistory(
      "10",
      USER,
      startTurn(),
      { role: "user", content: "Earlier question" },
      { role: "assistant", content: "Earlier answer" },
    );

    const firstChat = ollama.nextChat();
    const busy = run(chat, fakeInteraction("20", "Hold the server"));
    const held = await firstChat;

    const queuedInteraction = fakeInteraction("10", "Queued question");
    const queued = run(chat, queuedInteraction);
    assert.equal(await isPending(queued, 50), true);

    const clear = fakeInteraction("10");
    await run(clearHistory, clear);
    await queued;

    held.answer("Busy answer");
    await busy;

    assert.deepEqual(lastReply(clear), {
      content:
        "Cleared your conversation history (1 message) and 1 pending message in this channel.",
    });
    assert.deepEqual(lastReply(queuedInteraction), CANCELLED);
    assert.deepEqual(getUserHistory("10", USER), []);
    assert.equal(ollama.chats.length, 1);
    assert.equal(getUserHistory("20", USER).length, 2);
  },
);

test(
  "clearhistory aborts a chat that is waiting for its answer",
  options,
  async (t) => {
    const ollama = await startFakeOllama(t);
    const firstChat = ollama.nextChat();
    const interaction = fakeInteraction("11", "Slow question");
    const running = run(chat, interaction);
    const held = await firstChat;

    const clear = fakeInteraction("11");
    await run(clearHistory, clear);
    await running;
    await held.closed;

    assert.deepEqual(lastReply(clear), {
      content: "Cleared 1 pending message in this channel.",
    });
    assert.deepEqual(lastReply(interaction), CANCELLED);
    assert.deepEqual(getUserHistory("11", USER), []);
    assert.equal(getConfig().servers[0].available, true);
  },
);

test(
  "clearhistory stops a chat that is streaming its answer",
  options,
  async (t) => {
    const ollama = await startFakeOllama(t);
    const firstChat = ollama.nextChat();
    const interaction = fakeInteraction("12", "Streamed question", true);
    const running = run(chat, interaction);
    const held = await firstChat;
    await delay(50);

    await run(clearHistory, fakeInteraction("12"));
    await running;
    await held.closed;

    assert.deepEqual(lastReply(interaction), CANCELLED);
    assert.deepEqual(getUserHistory("12", USER), []);
    assert.equal(getConfig().servers[0].available, true);
  },
);

test(
  "clearhistory leaves the chats of other users in the channel running",
  options,
  async (t) => {
    const ollama = await startFakeOllama(t);
    const firstChat = ollama.nextChat();
    const theirs = fakeInteraction("13", "Their question", false, "2");
    const running = run(chat, theirs);
    const held = await firstChat;

    const clear = fakeInteraction("13");
    await run(clearHistory, clear);
    held.answer("Their answer");
    await running;

    assert.deepEqual(lastReply(clear), {
      content: "You have no conversation history to clear in this channel.",
    });
    assert.deepEqual(lastReply(theirs), {
      content: "Their answer",
      components: [],
    });
    assert.deepEqual(getUserHistory("13", "2"), [
      { role: "user", content: "User 2: Their question" },
      { role: "assistant", content: "Their answer" },
    ]);
  },
);

test(
  "chat keeps the conversation going when it is not cleared",
  options,
  async (t) => {
    const ollama = await startFakeOllama(t);

    const firstChat = ollama.nextChat();
    const asking = run(chat, fakeInteraction("14", "First question"));
    (await firstChat).answer("First answer");
    await asking;

    const secondChat = ollama.nextChat();
    const streaming = run(chat, fakeInteraction("14", "Second question", true));
    const held = await secondChat;
    held.answer("Second answer");
    await streaming;

    assert.deepEqual(held.body.messages, [
      { role: "user", content: "User 1: First question" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "User 1: Second question" },
    ]);
    assert.deepEqual(getUserHistory("14", USER), [
      { role: "user", content: "User 1: First question" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "User 1: Second question" },
      { role: "assistant", content: "Second answer" },
    ]);
  },
);
