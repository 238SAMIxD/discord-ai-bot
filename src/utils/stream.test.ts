import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { handleStreamResponse } from "./stream.js";

import type { ChatInputCommandInteraction } from "discord.js";

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
