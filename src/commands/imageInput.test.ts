import test, {
  after,
  before,
  beforeEach,
  mock,
  type TestContext,
} from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { text } from "node:stream/consumers";
import { MessageFlags } from "discord.js";
import chat from "./chat.js";
import generate from "./generate.js";
import { getCommandData, resolveImageInput } from "./commands.js";
import { clearModelInfoCache } from "../api/ollama.js";
import { clearConfigCache } from "../config.js";
import {
  closeChatHistory,
  getUserHistory,
  openChatHistory,
} from "../state/conversations.js";
import { cancelPendingChats } from "../state/pendingChats.js";
import { Logger, setLogger } from "../utils/logger.js";

import type { AddressInfo } from "node:net";
import type { ChatInputCommandInteraction } from "discord.js";
import type {
  BotCommand,
  OllamaChatRequest,
  OllamaGenerateRequest,
} from "../types.js";

interface FakeAttachment {
  name: string;
  size: number;
  contentType: string | null;
  url: string;
}

type FakeInteraction = ReturnType<typeof fakeInteraction>;

const USER = "1";
const PIXEL = Buffer.from("fake image bytes");
const options = { timeout: 5_000 };

setLogger(new Logger(true, "imageInput.test"));
process.env.TOKEN = "test-token";
process.env.USE_SYSTEM = "false";
process.env.USE_BOT_CONTEXT = "false";
process.env.USE_MODEL_SYSTEM = "false";
process.env.STABLE_DIFFUSION = "";
process.env.SHOW_STATS = "false";
process.env.MAX_IMAGE_SIZE_MB = "1";
process.env.MODEL = "orca";
process.env.SLOWMODE_DELAY = "0";

before(() => openChatHistory(":memory:"));
after(() => closeChatHistory());
beforeEach(() => {
  process.env.IMAGE_INPUT = "auto";
  clearModelInfoCache();
  clearConfigCache();
});

async function startFakeOllama(t: TestContext, visionModels: string[]) {
  const installed = ["orca:latest", ...visionModels];
  const requests: string[] = [];
  const chats: OllamaChatRequest[] = [];
  const generations: OllamaGenerateRequest[] = [];

  const server = createServer(async (req, res) => {
    requests.push(req.url ?? "");
    const json = (body: unknown, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    switch (req.url) {
      case "/api/tags":
        json({ models: installed.map((name) => ({ name, model: name })) });
        return;
      case "/api/show": {
        const { name } = JSON.parse(await text(req)) as { name: string };
        json({
          capabilities: visionModels.includes(name)
            ? ["completion", "vision"]
            : ["completion"],
        });
        return;
      }
      case "/api/chat":
        chats.push(JSON.parse(await text(req)) as OllamaChatRequest);
        json({ message: { role: "assistant", content: "A cat." }, done: true });
        return;
      case "/api/generate":
        generations.push(JSON.parse(await text(req)) as OllamaGenerateRequest);
        json({ response: "A cat.", done: true });
        return;
      case "/cat.png":
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(PIXEL);
        return;
      default:
        res.writeHead(404).end();
    }
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.OLLAMA = url;
  clearConfigCache();

  return {
    url,
    requests,
    chats,
    generations,
    image: (overrides: Partial<FakeAttachment> = {}): FakeAttachment => ({
      name: "cat.png",
      size: PIXEL.length,
      contentType: "image/png",
      url: `${url}/cat.png`,
      ...overrides,
    }),
  };
}

let interactionCount = 0;

function fakeInteraction(
  channelId: string,
  prompt: string,
  model: string | null,
  attachments: Record<string, FakeAttachment> = {},
) {
  return {
    id: String(++interactionCount),
    channelId,
    user: { id: USER, displayName: `User ${USER}` },
    deferred: false,
    replied: false,
    options: {
      getString: (name: string) =>
        name === "prompt" ? prompt : name === "model" ? model : null,
      getBoolean: () => null,
      getAttachment: (name: string) => attachments[name] ?? null,
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
  return interaction.editReply.mock.calls.at(-1)?.arguments[0];
}

function chatOptionNames(imageInput: boolean): string[] {
  const data = getCommandData({ imageInput }).find(
    (d) => d.name === "chat",
  ) as { toJSON(): { options?: { name: string }[] } };
  return (data.toJSON().options ?? []).map((o) => o.name);
}

test("auto offers the image option when a vision model is installed", async (t) => {
  const ollama = await startFakeOllama(t, ["llava:latest"]);
  assert.equal(await resolveImageInput(), true);
  assert.ok(ollama.requests.includes("/api/tags"));
  assert.deepEqual(chatOptionNames(true), [
    "prompt",
    "model",
    "stream",
    "image",
  ]);
});

test("auto leaves the image option out when no vision model is installed", async (t) => {
  await startFakeOllama(t, []);
  assert.equal(await resolveImageInput(), false);
  assert.deepEqual(chatOptionNames(false), ["prompt", "model", "stream"]);
});

test("auto leaves the image option out when Ollama is unreachable", async () => {
  process.env.OLLAMA = "http://127.0.0.1:1";
  clearConfigCache();
  assert.equal(await resolveImageInput(), false);
});

test("IMAGE_INPUT=true and false skip the startup probe", async (t) => {
  const ollama = await startFakeOllama(t, []);
  process.env.IMAGE_INPUT = "true";
  clearConfigCache();
  assert.equal(await resolveImageInput(), true);
  process.env.IMAGE_INPUT = "false";
  clearConfigCache();
  assert.equal(await resolveImageInput(), false);
  assert.deepEqual(ollama.requests, []);
});

test(
  "chat turns down an image for a model without vision",
  options,
  async (t) => {
    const ollama = await startFakeOllama(t, ["llava:latest", "qwen2.5vl:7b"]);
    const interaction = fakeInteraction("20", "What is this?", "orca:latest", {
      image: ollama.image(),
    });
    await run(chat, interaction);

    assert.deepEqual(lastReply(interaction), {
      content:
        "`orca:latest` can't read images. Vision models available: `llava:latest`, `qwen2.5vl:7b` — pick one with the `model` option.",
      components: [],
    });
    assert.deepEqual(ollama.chats, []);
    assert.ok(!ollama.requests.includes("/cat.png"));
    assert.deepEqual(getUserHistory("20", USER), []);
    assert.equal(cancelPendingChats("20", USER), 0);
  },
);

test("chat says when no vision model is installed", options, async (t) => {
  const ollama = await startFakeOllama(t, []);
  const interaction = fakeInteraction("21", "What is this?", null, {
    image: ollama.image(),
  });
  await run(chat, interaction);

  assert.deepEqual(lastReply(interaction), {
    content:
      "`orca` can't read images, and no vision model is installed on the Ollama server.",
    components: [],
  });
  assert.deepEqual(ollama.chats, []);
});

test(
  "chat turns down attachments that are not images or are too big",
  options,
  async (t) => {
    const ollama = await startFakeOllama(t, ["llava:latest"]);
    const notImage = fakeInteraction("22", "Read this", "llava:latest", {
      image: ollama.image({ name: "notes.txt", contentType: "text/plain" }),
    });
    await run(chat, notImage);
    assert.deepEqual(lastReply(notImage), {
      content:
        "`notes.txt` isn't an image. Attach a PNG, JPEG, GIF or WebP file.",
      components: [],
    });

    const tooBig = fakeInteraction("22", "Look", "llava:latest", {
      image: ollama.image({ size: 2 * 1024 * 1024 }),
    });
    await run(chat, tooBig);
    assert.deepEqual(lastReply(tooBig), {
      content: "`cat.png` is too big. Images must be under 1 MB.",
      components: [],
    });

    assert.deepEqual(ollama.requests, []);
  },
);

test(
  "chat sends the image to a vision model and saves only a marker",
  options,
  async (t) => {
    const ollama = await startFakeOllama(t, ["llava:latest"]);
    const interaction = fakeInteraction("23", "What is this?", "llava:latest", {
      image: ollama.image(),
    });
    await run(chat, interaction);

    assert.deepEqual(ollama.chats[0]?.messages, [
      {
        role: "user",
        content: "User 1: What is this? [image: cat.png]",
        images: [PIXEL.toString("base64")],
      },
    ]);
    assert.deepEqual(getUserHistory("23", USER), [
      { role: "user", content: "User 1: What is this? [image: cat.png]" },
      { role: "assistant", content: "A cat." },
    ]);
  },
);

test(
  "generate turns down images for a model without vision",
  options,
  async (t) => {
    const ollama = await startFakeOllama(t, ["llava:latest"]);
    const interaction = fakeInteraction("24", "Describe", "orca:latest", {
      attachment1: ollama.image(),
    });
    await run(generate, interaction);

    assert.deepEqual(lastReply(interaction), {
      content:
        "`orca:latest` can't read images. Vision models available: `llava:latest` — pick one with the `model` option.",
      components: [],
    });
    assert.deepEqual(ollama.generations, []);
    assert.ok(!ollama.requests.includes("/cat.png"));
  },
);

test(
  "generate ignores images and says so when image input is off",
  options,
  async (t) => {
    process.env.IMAGE_INPUT = "false";
    const ollama = await startFakeOllama(t, ["llava:latest"]);
    const interaction = fakeInteraction("25", "Describe", "orca:latest", {
      attachment1: ollama.image(),
    });
    await run(generate, interaction);

    assert.equal(ollama.generations.length, 1);
    assert.equal(ollama.generations[0]?.images, undefined);
    assert.ok(!ollama.requests.includes("/cat.png"));
    assert.deepEqual(interaction.followUp.mock.calls[0]?.arguments[0], {
      content:
        "Image input is turned off on this bot, so `cat.png` was ignored.",
      flags: MessageFlags.Ephemeral,
    });
  },
);
