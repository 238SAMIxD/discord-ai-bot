import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { setImmediate, setTimeout as delay } from "node:timers/promises";
import { handleStreamResponse } from "./stream.js";

import type {
  ActionRowBuilder,
  APIButtonComponentWithCustomId,
  ButtonBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import type { OllamaStats } from "../types.js";

interface FinalReply {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
}

process.env.TOKEN = "test-token";
process.env.OLLAMA = "http://localhost:11434";
process.env.SHOW_STATS = "true";

function isPending(promise: Promise<unknown>, ms: number) {
  return Promise.race([promise.then(() => false), delay(ms, true)]);
}

function fakeInteraction() {
  return {
    editReply: mock.fn(async (_reply: string | FinalReply) => undefined),
    followUp: mock.fn(async (_reply: FinalReply) => undefined),
  };
}

function contentOf(reply: string | FinalReply | undefined) {
  return typeof reply === "string" ? reply : reply?.content;
}

function buttonLabels(reply: FinalReply | undefined) {
  return reply?.components.map((row) =>
    row.components.map(
      (button) => (button.toJSON() as APIButtonComponentWithCustomId).label,
    ),
  );
}

test("handleStreamResponse saves the finished text before the final edit", async () => {
  const events: string[] = [];
  let edited: () => void = () => undefined;
  const finalEdit = new Promise<void>((resolve) => {
    edited = resolve;
  });
  const interaction = {
    editReply: mock.fn(async (reply: string | FinalReply) => {
      events.push(`edit: ${typeof reply === "string" ? reply : reply.content}`);
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
  const onComplete = mock.fn(() => undefined);
  const stream = new PassThrough();
  const outcome = handleStreamResponse(
    interaction as unknown as ChatInputCommandInteraction,
    stream,
    onComplete,
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
  assert.equal(onComplete.mock.callCount(), 0);
});

test("handleStreamResponse puts the stats from the last chunk on the final message", async () => {
  const interaction = fakeInteraction();
  const stream = new PassThrough();
  const done = handleStreamResponse(
    interaction as unknown as ChatInputCommandInteraction,
    stream,
    () => undefined,
  );
  stream.end(
    [
      JSON.stringify({ message: { content: "Hello" }, done: false }),
      JSON.stringify({
        model: "llama3.2:3b",
        message: { content: "" },
        done: true,
        eval_count: 2,
        eval_duration: 1_000_000_000,
        total_duration: 1_500_000_000,
      }),
    ].join("\n"),
  );
  await done;

  const final = interaction.editReply.mock.calls.at(-1)?.arguments[0];
  assert.equal(contentOf(final), "Hello");
  assert.deepEqual(buttonLabels(final as FinalReply), [
    ["llama3.2:3b", "2 tokens", "2.0 tokens/s"],
    ["1.5 s total"],
  ]);
  assert.equal(interaction.followUp.mock.callCount(), 0);
});

test("handleStreamResponse puts the stats buttons on the last message of a long answer", async () => {
  const interaction = fakeInteraction();
  const stream = new PassThrough();
  const done = handleStreamResponse(
    interaction as unknown as ChatInputCommandInteraction,
    stream,
    () => undefined,
  );
  const words = Array.from({ length: 500 }, (_, i) => `word${i}`).join(" ");
  stream.end(
    `${JSON.stringify({ response: words })}\n${JSON.stringify({
      done: true,
      eval_count: 500,
      eval_duration: 2_000_000_000,
    })}\n`,
  );
  await done;

  const first = interaction.editReply.mock.calls.at(-1)?.arguments[0];
  assert.deepEqual((first as FinalReply).components, []);
  assert.equal(interaction.followUp.mock.callCount(), 1);
  assert.deepEqual(
    buttonLabels(interaction.followUp.mock.calls[0]?.arguments[0]),
    [["500 tokens", "250.0 tokens/s"]],
  );
});

function stoppableStream(
  completeStats?: (stats: OllamaStats) => Promise<OllamaStats>,
) {
  const saved: string[] = [];
  const interaction = fakeInteraction();
  const stream = new PassThrough();
  const stop = new AbortController();
  const outcome = handleStreamResponse(
    interaction as unknown as ChatInputCommandInteraction,
    stream,
    (text) => {
      saved.push(text);
    },
    stop.signal,
    completeStats,
  );
  const stopStream = () => {
    stop.abort();
    stream.destroy(new Error("Stopped"));
  };
  return { saved, interaction, stream, outcome, stopStream };
}

test("handleStreamResponse keeps the text so far without saving it once stopped", async () => {
  const { saved, interaction, stream, outcome, stopStream } = stoppableStream();

  stream.write(`${JSON.stringify({ message: { content: "Hello" } })}
`);
  await setImmediate();
  stopStream();

  assert.equal(await outcome, true);
  assert.deepEqual(saved, []);
  assert.equal(
    contentOf(interaction.editReply.mock.calls.at(-1)?.arguments[0]),
    "Hello",
  );
});

test("handleStreamResponse keeps a last chunk that arrived without a newline once stopped", async () => {
  const { saved, interaction, stream, outcome, stopStream } = stoppableStream();

  stream.write(JSON.stringify({ message: { content: "Hello" } }));
  await setImmediate();
  stopStream();

  assert.equal(await outcome, true);
  assert.deepEqual(saved, []);
  assert.equal(
    contentOf(interaction.editReply.mock.calls.at(-1)?.arguments[0]),
    "Hello",
  );
});

test("handleStreamResponse leaves the stats buttons off a stopped reply", async () => {
  const { interaction, stream, outcome, stopStream } = stoppableStream();

  stream.write(
    `${JSON.stringify({ message: { content: "Hello" }, done: true, eval_count: 2 })}
`,
  );
  await setImmediate();
  stopStream();

  assert.equal(await outcome, true);
  const final = interaction.editReply.mock.calls.at(-1)?.arguments[0];
  assert.deepEqual(buttonLabels(final as FinalReply), []);
});

test("handleStreamResponse posts the rest of a long stopped reply as follow-ups", async () => {
  const { interaction, stream, outcome, stopStream } = stoppableStream();
  const text = "Hello ".repeat(400).trim();

  stream.write(`${JSON.stringify({ message: { content: text } })}
`);
  await setImmediate();
  stopStream();

  assert.equal(await outcome, true);
  const first = contentOf(
    interaction.editReply.mock.calls.at(-1)?.arguments[0],
  );
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

test("handleStreamResponse adds the completed stats to the final message", async () => {
  const interaction = fakeInteraction();
  const stream = new PassThrough();
  const completeStats = mock.fn(async (stats: OllamaStats) => ({
    ...stats,
    context_length: 4096,
  }));
  const done = handleStreamResponse(
    interaction as unknown as ChatInputCommandInteraction,
    stream,
    () => undefined,
    undefined,
    completeStats,
  );
  stream.end(
    JSON.stringify({
      message: { content: "Hello" },
      done: true,
      prompt_eval_count: 1000,
      eval_count: 24,
    }),
  );
  await done;

  assert.equal(completeStats.mock.callCount(), 1);
  const final = interaction.editReply.mock.calls.at(-1)?.arguments[0];
  assert.deepEqual(buttonLabels(final as FinalReply), [
    ["24 tokens"],
    ["1,000 prompt tokens", "1,024 / 4,096 ctx"],
  ]);
});

test("handleStreamResponse skips completing the stats once stopped", async () => {
  const completeStats = mock.fn(async (stats: OllamaStats) => stats);
  const { stream, outcome, stopStream } = stoppableStream(completeStats);

  stream.write(
    `${JSON.stringify({ message: { content: "Hello" }, done: true, eval_count: 2 })}
`,
  );
  await setImmediate();
  stopStream();

  assert.equal(await outcome, true);
  assert.equal(completeStats.mock.callCount(), 0);
});
