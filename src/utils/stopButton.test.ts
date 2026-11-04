import test, { after, before, mock, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { createServer } from "node:http";
import { text } from "node:stream/consumers";
import { setTimeout as delay } from "node:timers/promises";
import { ButtonStyle, MessageFlags } from "discord.js";
import chat from "../commands/chat.js";
import generate from "../commands/generate.js";
import text2img from "../commands/text2img.js";
import { clearConfigCache, getConfig } from "../config.js";
import {
  closeChatHistory,
  getUserHistory,
  openChatHistory,
} from "../state/conversations.js";
import { resetSlowmode } from "../state/slowmode.js";
import { Logger, setLogger } from "./logger.js";
import { createStopButton, handleStopButton } from "./stopButton.js";

import type { AddressInfo } from "node:net";
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import type { BotCommand } from "../types.js";

interface HeldRequest {
  path: string;
  taskId?: string;
  closed: Promise<unknown>;
  write(content: string): void;
  answer(body: object): void;
}

interface ButtonJSON {
  label?: string;
  style: ButtonStyle;
  disabled?: boolean;
}

type FakeCommand = ReturnType<typeof fakeCommand>;

const OWNER = "1";
const OTHER = "2";
const STOP = [{ label: "Stop", style: ButtonStyle.Danger, disabled: false }];
const STOPPED = [
  { label: "Stopped", style: ButtonStyle.Secondary, disabled: true },
];
const STATS = [
  { label: "2 tokens", style: ButtonStyle.Primary, disabled: false },
  { label: "2.0 tokens/s", style: ButtonStyle.Success, disabled: false },
];
const options = { timeout: 5_000 };

setLogger(new Logger(true, "stopButton.test"));
process.env.TOKEN = "test-token";
process.env.USE_SYSTEM = "false";
process.env.USE_BOT_CONTEXT = "false";
process.env.USE_MODEL_SYSTEM = "false";
process.env.SHOW_STATS = "true";
process.env.SLOWMODE_DELAY = "0";

before(() => openChatHistory(":memory:"));
after(() => closeChatHistory());

async function startFakeServer(t: TestContext, imagesStart = true) {
  const received = new EventEmitter();
  const interrupts: string[] = [];
  const progressChecks: string[] = [];
  const images = new Map<string, HeldRequest>();

  const server = createServer(async (req, res) => {
    const body = await text(req);
    if (req.url === "/sdapi/v1/interrupt") {
      interrupts.push(req.url);
      res.end();
      for (const image of [...images.values()]) image.answer({ images: [] });
      return;
    }
    if (req.url === "/internal/progress") {
      const { id_task } = JSON.parse(body) as { id_task: string };
      progressChecks.push(id_task);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ active: imagesStart && images.has(id_task) }));
      return;
    }

    const { stream, force_task_id: taskId } = JSON.parse(body) as {
      stream?: boolean;
      force_task_id?: string;
    };
    const closed = once(res, "close");
    if (stream) {
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      res.write(
        JSON.stringify({ message: { content: "" }, done: false }) + "\n",
      );
    }

    const held: HeldRequest = {
      path: req.url ?? "",
      taskId,
      closed,
      write(content) {
        res.write(JSON.stringify({ message: { content }, done: false }) + "\n");
      },
      answer(reply) {
        if (taskId) images.delete(taskId);
        if (!stream) {
          res.writeHead(200, { "Content-Type": "application/json" });
        }
        res.end(JSON.stringify(reply) + "\n");
      },
    };
    if (taskId) images.set(taskId, held);
    received.emit("request", held);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.OLLAMA = url;
  process.env.STABLE_DIFFUSION = url;
  clearConfigCache();

  return {
    interrupts,
    progressChecks,
    nextRequest: async () =>
      (await once(received, "request"))[0] as HeldRequest,
  };
}

async function waitUntil(check: () => boolean) {
  while (!check()) await delay(5);
}

let interactionCount = 0;

function fakeCommand(
  values: Record<string, string | boolean> = {},
  userId = OWNER,
) {
  const id = String(++interactionCount);
  const option = <T>(name: string, type: string) =>
    typeof values[name] === type ? (values[name] as T) : null;
  return {
    id,
    channelId: id,
    user: { id: userId, displayName: `User ${userId}` },
    deferred: false,
    replied: false,
    options: {
      getString: (name: string) => option<string>(name, "string"),
      getBoolean: (name: string) => option<boolean>(name, "boolean"),
      getInteger: () => null,
      getAttachment: () => null,
    },
    deferReply: mock.fn(async () => undefined),
    reply: mock.fn(async (_reply: unknown) => undefined),
    editReply: mock.fn(async (_reply: unknown) => ({})),
    followUp: mock.fn(async (_reply: unknown) => ({})),
  };
}

function run(command: BotCommand, interaction: FakeCommand) {
  return command.execute(interaction as unknown as ChatInputCommandInteraction);
}

function startStop(interaction: FakeCommand) {
  return createStopButton(
    interaction as unknown as ChatInputCommandInteraction,
  );
}

async function click(interaction: FakeCommand, userId = OWNER) {
  const button = {
    customId: `stop:${interaction.id}`,
    user: { id: userId },
    reply: mock.fn(async (_reply: unknown) => undefined),
    deferUpdate: mock.fn(async () => undefined),
  };
  await handleStopButton(button as unknown as ButtonInteraction);
  return button;
}

function edits(interaction: FakeCommand) {
  return interaction.editReply.mock.calls.map((call) => call.arguments[0]);
}

function lastContent(interaction: FakeCommand) {
  return edits(interaction)
    .map((reply) =>
      typeof reply === "string"
        ? reply
        : (reply as { content?: string }).content,
    )
    .filter((content) => content !== undefined)
    .at(-1);
}

function lastButtons(interaction: FakeCommand) {
  const reply = edits(interaction)
    .map(
      (edit) =>
        edit as { components?: { toJSON(): { components: ButtonJSON[] } }[] },
    )
    .filter((edit) => edit.components !== undefined)
    .at(-1);
  return (reply?.components ?? [])
    .flatMap((row) => row.toJSON().components)
    .map(({ label, style, disabled }) => ({
      label,
      style,
      disabled: disabled ?? false,
    }));
}

test("createStopButton shows a red Stop button and removes it once finished", async () => {
  const interaction = fakeCommand();
  const stop = startStop(interaction);

  await stop.show();
  assert.equal(lastContent(interaction), "Generating…");
  assert.deepEqual(lastButtons(interaction), STOP);

  await stop.finish();
  assert.deepEqual(edits(interaction).at(-1), { components: [] });
});

test("createStopButton shows the request's place in line while it waits", async () => {
  const interaction = fakeCommand();
  const stop = startStop(interaction);

  stop.queueStatus(2);
  assert.equal(interaction.editReply.mock.callCount(), 0);

  await stop.show();
  stop.queueStatus(2);
  assert.equal(
    lastContent(interaction),
    "Waiting in line: 2 requests ahead of you…",
  );
  stop.queueStatus(1);
  assert.equal(
    lastContent(interaction),
    "Waiting in line: 1 request ahead of you…",
  );
  stop.queueStatus(0);
  assert.equal(
    lastContent(interaction),
    "Waiting for the current answer to finish…",
  );
  assert.deepEqual(lastButtons(interaction), STOP);
  stop.queueStatus(null);
  assert.equal(lastContent(interaction), "Generating…");

  const calls = interaction.editReply.mock.callCount();
  stop.complete();
  stop.queueStatus(0);
  assert.equal(interaction.editReply.mock.callCount(), calls);
  await stop.finish();
});

test("createStopButton leaves a disabled Stopped button on a reply stopped partway", async () => {
  const interaction = fakeCommand();
  const stop = startStop(interaction);

  await stop.show();
  await stop.finish(true);

  assert.deepEqual(lastButtons(interaction), STOPPED);
});

test("createStopButton leaves the buttons of an answered reply alone", async () => {
  const interaction = fakeCommand();
  const stop = startStop(interaction);

  await stop.show();
  stop.complete();
  await stop.finish();

  assert.equal(interaction.editReply.mock.callCount(), 1);
});

test("createStopButton doesn't edit a reply it never showed the button on", async () => {
  const interaction = fakeCommand();
  const stop = startStop(interaction);

  await stop.finish();

  assert.equal(interaction.editReply.mock.callCount(), 0);
});

test("handleStopButton stops the request of the person who ran the command", async () => {
  const interaction = fakeCommand();
  const stop = startStop(interaction);
  await stop.show();

  const button = await click(interaction);

  assert.equal(stop.signal.aborted, true);
  assert.equal(button.deferUpdate.mock.callCount(), 1);
  assert.equal(button.reply.mock.callCount(), 0);
  await stop.finish();
});

test("handleStopButton refuses anyone else", async () => {
  const interaction = fakeCommand();
  const stop = startStop(interaction);
  await stop.show();

  const button = await click(interaction, OTHER);

  assert.equal(stop.signal.aborted, false);
  assert.equal(button.deferUpdate.mock.callCount(), 0);
  assert.deepEqual(button.reply.mock.calls[0]?.arguments, [
    {
      content: "Only the person who ran this command can stop it.",
      flags: MessageFlags.Ephemeral,
    },
  ]);
  await stop.finish();
});

test("handleStopButton treats a request whose answer arrived as no longer running", async () => {
  const interaction = fakeCommand();
  const stop = startStop(interaction);
  await stop.show();
  stop.complete();

  const button = await click(interaction);

  assert.equal(stop.signal.aborted, false);
  assert.equal(button.deferUpdate.mock.callCount(), 0);
  assert.equal(button.reply.mock.callCount(), 1);
  await stop.finish();
});

test("handleStopButton says when the response is no longer running", async () => {
  const interaction = fakeCommand();
  const stop = startStop(interaction);
  await stop.show();
  await stop.finish();

  const button = await click(interaction);

  assert.equal(stop.signal.aborted, false);
  assert.equal(button.deferUpdate.mock.callCount(), 0);
  assert.deepEqual(button.reply.mock.calls[0]?.arguments, [
    {
      content: "This response is no longer running.",
      flags: MessageFlags.Ephemeral,
    },
  ]);
});

test(
  "stopping /chat closes its request, saves nothing and frees the server",
  options,
  async (t) => {
    const server = await startFakeServer(t);
    const request = server.nextRequest();
    const interaction = fakeCommand({ prompt: "Slow question" });
    const running = run(chat, interaction);
    const held = await request;

    await click(interaction);
    await running;
    await held.closed;

    assert.equal(held.path, "/api/chat");
    assert.equal(lastContent(interaction), "Stopped.");
    assert.deepEqual(lastButtons(interaction), []);
    assert.deepEqual(getUserHistory(interaction.channelId, OWNER), []);
    assert.equal(getConfig().servers[0].available, true);
  },
);

test(
  "stopping a streamed /chat keeps the text so far and saves nothing",
  options,
  async (t) => {
    const server = await startFakeServer(t);
    const request = server.nextRequest();
    const interaction = fakeCommand({ prompt: "Long question", stream: true });
    const running = run(chat, interaction);
    const held = await request;
    held.write("Partial answer");
    await delay(50);

    await click(interaction);
    await running;
    await held.closed;

    assert.equal(lastContent(interaction), "Partial answer");
    assert.deepEqual(lastButtons(interaction), STOPPED);
    assert.deepEqual(getUserHistory(interaction.channelId, OWNER), []);
    assert.equal(getConfig().servers[0].available, true);
  },
);

test(
  "someone else's click leaves /chat running to the end",
  options,
  async (t) => {
    const server = await startFakeServer(t);
    const request = server.nextRequest();
    const interaction = fakeCommand({ prompt: "Question" });
    const running = run(chat, interaction);
    const held = await request;

    const button = await click(interaction, OTHER);
    held.answer({ message: { role: "assistant", content: "Answer" } });
    await running;

    assert.equal(button.reply.mock.callCount(), 1);
    assert.equal(lastContent(interaction), "Answer");
    assert.deepEqual(lastButtons(interaction), []);
    assert.deepEqual(getUserHistory(interaction.channelId, OWNER), [
      { role: "user", content: `User ${OWNER}: Question` },
      { role: "assistant", content: "Answer" },
    ]);
  },
);

test(
  "an answered /chat swaps the Stop button for its stats buttons",
  options,
  async (t) => {
    const server = await startFakeServer(t);
    const request = server.nextRequest();
    const interaction = fakeCommand({ prompt: "Question" });
    const running = run(chat, interaction);
    const held = await request;

    held.answer({
      message: { role: "assistant", content: "Answer" },
      eval_count: 2,
      eval_duration: 1_000_000_000,
    });
    await running;

    assert.equal(lastContent(interaction), "Answer");
    assert.deepEqual(lastButtons(interaction), STATS);
  },
);

test(
  "a streamed /generate swaps the Stop button for its stats buttons",
  options,
  async (t) => {
    const server = await startFakeServer(t);
    const request = server.nextRequest();
    const interaction = fakeCommand({ prompt: "Write a story", stream: true });
    const running = run(generate, interaction);
    const held = await request;

    held.answer({
      response: "Story",
      done: true,
      eval_count: 2,
      eval_duration: 1_000_000_000,
    });
    await running;

    assert.equal(lastContent(interaction), "Story");
    assert.deepEqual(lastButtons(interaction), STATS);
  },
);

test("stopping /generate closes its request", options, async (t) => {
  const server = await startFakeServer(t);
  const request = server.nextRequest();
  const interaction = fakeCommand({ prompt: "Write a story" });
  const running = run(generate, interaction);
  const held = await request;

  await click(interaction);
  await running;
  await held.closed;

  assert.equal(held.path, "/api/generate");
  assert.equal(lastContent(interaction), "Stopped.");
  assert.deepEqual(lastButtons(interaction), []);
  assert.equal(getConfig().servers[0].available, true);
});

test(
  "stopping /text2img interrupts its own image and keeps the server busy until it ends",
  options,
  async (t) => {
    const server = await startFakeServer(t);
    const request = server.nextRequest();
    const interaction = fakeCommand({ prompt: "A red fox" });
    const running = run(text2img, interaction);
    const held = await request;

    await click(interaction);
    await running;
    await held.closed;
    await waitUntil(() => getConfig().stableDiffusionServers[0].available);

    assert.equal(held.path, "/sdapi/v1/txt2img");
    assert.equal(typeof held.taskId, "string");
    assert.deepEqual(server.progressChecks, [held.taskId]);
    assert.deepEqual(server.interrupts, ["/sdapi/v1/interrupt"]);
    assert.equal(lastContent(interaction), "Stopped.");
    assert.deepEqual(lastButtons(interaction), []);
  },
);

test(
  "stopping /text2img leaves an image Stable Diffusion hasn't started alone",
  options,
  async (t) => {
    const server = await startFakeServer(t, false);
    const request = server.nextRequest();
    const interaction = fakeCommand({ prompt: "A blue fox" });
    const running = run(text2img, interaction);
    const held = await request;

    await click(interaction);
    await running;
    await waitUntil(() => server.progressChecks.length === 1);
    await delay(50);

    assert.equal(lastContent(interaction), "Stopped.");
    assert.deepEqual(server.interrupts, []);
    assert.equal(getConfig().stableDiffusionServers[0].available, false);

    held.answer({ images: [] });
    await waitUntil(() => getConfig().stableDiffusionServers[0].available);
  },
);

test(
  "a failed /chat reply after its answer arrived isn't Stopped and has no Stop button",
  options,
  async (t) => {
    const server = await startFakeServer(t);
    const request = server.nextRequest();
    const interaction = fakeCommand({ prompt: "Question" });
    const lateClicks: Awaited<ReturnType<typeof click>>[] = [];
    interaction.editReply.mock.mockImplementation(async (reply: unknown) => {
      if ((reply as { content?: string }).content === "Answer") {
        lateClicks.push(await click(interaction));
        throw new Error("Discord is down");
      }
      return {};
    });
    const running = run(chat, interaction);
    const held = await request;

    held.answer({ message: { role: "assistant", content: "Answer" } });
    await running;

    assert.deepEqual(lateClicks[0]?.reply.mock.calls[0]?.arguments, [
      {
        content: "This response is no longer running.",
        flags: MessageFlags.Ephemeral,
      },
    ]);
    assert.deepEqual(edits(interaction).at(-1), {
      content: "Failed to run chat.",
      components: [],
    });
    assert.deepEqual(getUserHistory(interaction.channelId, OWNER), [
      { role: "user", content: `User ${OWNER}: Question` },
      { role: "assistant", content: "Answer" },
    ]);
  },
);

test(
  "a /chat sent while the server is busy waits in line, then answers",
  options,
  async (t) => {
    const server = await startFakeServer(t);
    const firstRequest = server.nextRequest();
    const first = fakeCommand({ prompt: "First" });
    const firstRunning = run(chat, first);
    const firstHeld = await firstRequest;

    const second = fakeCommand({ prompt: "Second" }, OTHER);
    const secondRunning = run(chat, second);
    await waitUntil(
      () => lastContent(second) === "Waiting for the current answer to finish…",
    );
    assert.deepEqual(lastButtons(second), STOP);

    const secondRequest = server.nextRequest();
    firstHeld.answer({ message: { role: "assistant", content: "One" } });
    await firstRunning;
    const secondHeld = await secondRequest;
    await waitUntil(() => lastContent(second) === "Generating…");

    secondHeld.answer({ message: { role: "assistant", content: "Two" } });
    await secondRunning;
    assert.equal(lastContent(second), "Two");
  },
);

test(
  "slow mode turns down a user's /chat and /generate until the delay after their answer",
  options,
  async (t) => {
    process.env.SLOWMODE_DELAY = "60000";
    resetSlowmode();
    t.after(() => {
      process.env.SLOWMODE_DELAY = "0";
      resetSlowmode();
      clearConfigCache();
    });
    const server = await startFakeServer(t);
    const request = server.nextRequest();
    const first = fakeCommand({ prompt: "Question" });
    const running = run(chat, first);
    const held = await request;

    const whileRunning = fakeCommand({ prompt: "Again" });
    await run(generate, whileRunning);
    assert.deepEqual(whileRunning.reply.mock.calls[0]?.arguments, [
      {
        content: "Slow mode: wait until your current answer finishes.",
        flags: MessageFlags.Ephemeral,
      },
    ]);
    assert.equal(whileRunning.deferReply.mock.callCount(), 0);

    held.answer({ message: { role: "assistant", content: "Answer" } });
    await running;

    const afterAnswer = fakeCommand({ prompt: "Again" });
    await run(chat, afterAnswer);
    assert.match(
      String(
        (afterAnswer.reply.mock.calls[0]?.arguments[0] as { content: string })
          .content,
      ),
      /^Slow mode: you can ask again <t:\d+:R>\.$/,
    );

    const otherUser = fakeCommand({ prompt: "Hi" }, OTHER);
    const otherRequest = server.nextRequest();
    const otherRunning = run(chat, otherUser);
    (await otherRequest).answer({
      message: { role: "assistant", content: "Hello" },
    });
    await otherRunning;
    assert.equal(otherUser.reply.mock.callCount(), 0);
    assert.equal(lastContent(otherUser), "Hello");
  },
);
