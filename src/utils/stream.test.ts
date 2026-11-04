import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { setImmediate, setTimeout as delay } from "node:timers/promises";
import { handleStreamResponse } from "./stream.js";

import type { ChatInputCommandInteraction } from "discord.js";

function isPending(promise: Promise<unknown>, ms: number) {
  return Promise.race([promise.then(() => false), delay(ms, true)]);
}

test("handleStreamResponse saves the finished text before the final edit", async () => {
  const events: string[] = [];
  let edited: () => void = () => undefined;
  const finalEdit = new Promise<void>((resolve) => {
    edited = resolve;
  });
  const interaction = {
    editReply: mock.fn(async (content: string) => {
      events.push(`edit: ${content}`);
      edited();
    }),
    followUp: mock.fn(async () => undefined),
  };
  const stream = new PassThrough();

  handleStreamResponse(
    interaction as unknown as ChatInputCommandInteraction,
    stream,
    (text) => {
      events.push(`save: ${text}`);
    },
  );
  stream.end(`${JSON.stringify({ message: { content: "Hello" } })}\n`);
  await finalEdit;

  assert.deepEqual(events, ["save: Hello", "edit: Hello"]);
});

test("handleStreamResponse lets an edit in flight finish before it rejects", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  let finishEdit: () => void = () => undefined;
  const interaction = {
    editReply: mock.fn(
      (_content: string) =>
        new Promise<void>((resolve) => {
          finishEdit = resolve;
        }),
    ),
    followUp: mock.fn(async () => undefined),
  };
  const stream = new PassThrough();
  const outcome = handleStreamResponse(
    interaction as unknown as ChatInputCommandInteraction,
    stream,
    () => undefined,
  ).then(
    () => "resolved",
    (error: Error) => error.message,
  );

  t.mock.timers.tick(1_000);
  stream.write(`${JSON.stringify({ message: { content: "Hel" } })}\n`);
  await setImmediate();
  stream.write(`${JSON.stringify({ message: { content: "lo" } })}\n`);
  await setImmediate();
  stream.destroy(new Error("Stream failed"));

  assert.equal(await isPending(outcome, 50), true);
  finishEdit();
  assert.equal(await outcome, "Stream failed");
  assert.equal(interaction.editReply.mock.callCount(), 1);
});

function stoppableStream() {
  const saved: string[] = [];
  const interaction = {
    editReply: mock.fn(async (_content: string) => undefined),
    followUp: mock.fn(async (_reply: { content: string }) => undefined),
  };
  const stream = new PassThrough();
  const stop = new AbortController();
  const outcome = handleStreamResponse(
    interaction as unknown as ChatInputCommandInteraction,
    stream,
    (text) => {
      saved.push(text);
    },
    stop.signal,
  );
  const stopStream = () => {
    stop.abort();
    stream.destroy(new Error("Stopped"));
  };
  return { saved, interaction, stream, outcome, stopStream };
}

test("handleStreamResponse keeps the text so far without saving it once stopped", async () => {
  const { saved, interaction, stream, outcome, stopStream } = stoppableStream();

  stream.write(`${JSON.stringify({ message: { content: "Hello" } })}\n`);
  await setImmediate();
  stopStream();

  assert.equal(await outcome, true);
  assert.deepEqual(saved, []);
  assert.deepEqual(interaction.editReply.mock.calls.at(-1)?.arguments, [
    "Hello",
  ]);
});

test("handleStreamResponse keeps a last chunk that arrived without a newline once stopped", async () => {
  const { saved, interaction, stream, outcome, stopStream } = stoppableStream();

  stream.write(JSON.stringify({ message: { content: "Hello" } }));
  await setImmediate();
  stopStream();

  assert.equal(await outcome, true);
  assert.deepEqual(saved, []);
  assert.deepEqual(interaction.editReply.mock.calls.at(-1)?.arguments, [
    "Hello",
  ]);
});

test("handleStreamResponse posts the rest of a long stopped reply as follow-ups", async () => {
  const { interaction, stream, outcome, stopStream } = stoppableStream();
  const text = "Hello ".repeat(400).trim();

  stream.write(`${JSON.stringify({ message: { content: text } })}\n`);
  await setImmediate();
  stopStream();

  assert.equal(await outcome, true);
  const [first] = interaction.editReply.mock.calls.at(-1)?.arguments ?? [];
  const rest = interaction.followUp.mock.calls.map(
    (call) => call.arguments[0].content,
  );
  assert.equal(rest.length, 1);
  assert.equal(`${first} ${rest[0]}`, text);
});

test("handleStreamResponse rejects when it is stopped before any text arrives", async () => {
  const { saved, interaction, outcome, stopStream } = stoppableStream();

  stopStream();

  await assert.rejects(outcome, /Stopped/);
  assert.deepEqual(saved, []);
  assert.equal(interaction.editReply.mock.callCount(), 0);
});
