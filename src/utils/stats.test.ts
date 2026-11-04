import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { ButtonStyle, MessageFlags } from "discord.js";
import { clearConfigCache } from "../config.js";
import { replyWithStats, statsComponents } from "./stats.js";

import type {
  APIButtonComponentWithCustomId,
  ButtonInteraction,
  EmbedBuilder,
  InteractionReplyOptions,
} from "discord.js";
import type { OllamaStats } from "../types.js";

process.env.TOKEN = "test-token";
process.env.OLLAMA = "http://localhost:11434";

const stats: OllamaStats = {
  model: "llama3.2:3b",
  prompt_eval_count: 1024,
  prompt_eval_duration: 354_000_000,
  eval_count: 256,
  eval_duration: 6_080_000_000,
  load_duration: 13_000_000,
  total_duration: 6_300_000_000,
};

function setShowStats(value: string) {
  process.env.SHOW_STATS = value;
  clearConfigCache();
}

function buttons(value: OllamaStats | undefined) {
  return statsComponents(value).map((row) =>
    row.components.map(
      (button) => button.toJSON() as APIButtonComponentWithCustomId,
    ),
  );
}

function labels(value: OllamaStats) {
  return buttons(value).map((row) => row.map((button) => button.label));
}

function fakeClick(customId: string) {
  return {
    customId,
    reply: mock.fn(async (_options: InteractionReplyOptions) => undefined),
  };
}

async function breakdown(customId: string) {
  const interaction = fakeClick(customId);
  await replyWithStats(interaction as unknown as ButtonInteraction);
  const [options] = interaction.reply.mock.calls[0]?.arguments ?? [];
  return {
    flags: options?.flags,
    embed: (options?.embeds?.[0] as EmbedBuilder | undefined)?.toJSON(),
  };
}

test("statsComponents shows each stat as a clickable button in two rows", () => {
  setShowStats("true");
  const rows = buttons(stats);
  assert.deepEqual(
    rows.map((row) =>
      row.map((button) => [button.emoji?.name, button.label, button.style]),
    ),
    [
      [
        ["🤖", "llama3.2:3b", ButtonStyle.Secondary],
        ["📝", "256 tokens", ButtonStyle.Primary],
        ["⚡", "42.1 tokens/s", ButtonStyle.Success],
      ],
      [
        ["📥", "1,024 prompt tokens", ButtonStyle.Secondary],
        ["💾", "13 ms load", ButtonStyle.Secondary],
        ["⌛", "6.3 s total", ButtonStyle.Secondary],
      ],
    ],
  );
  assert.ok(rows.flat().every((button) => !button.disabled));
});

test("statsComponents skips the stats Ollama did not send", () => {
  setShowStats("true");
  assert.deepEqual(
    labels({ model: "llama3.2:3b", eval_count: 1, eval_duration: 0 }),
    [["llama3.2:3b", "1 token"]],
  );
  assert.deepEqual(labels({ total_duration: 2_000_000_000 }), [
    ["2.0 s total"],
  ]);
  assert.deepEqual(buttons({ model: "llama3.2:3b" }), []);
  assert.deepEqual(buttons(undefined), []);
});

test("statsComponents is on unless SHOW_STATS turns it off", () => {
  setShowStats("false");
  assert.deepEqual(buttons(stats), []);
  setShowStats("");
  assert.equal(buttons(stats).length, 2);
  setShowStats("true");
  assert.equal(buttons(stats).length, 2);
});

test("statsComponents keeps button IDs unique and within Discord's limits", () => {
  setShowStats("true");
  const huge = Number.MAX_SAFE_INTEGER;
  const all = buttons({
    model: "m".repeat(200),
    prompt_eval_count: huge,
    prompt_eval_duration: huge,
    eval_count: huge,
    eval_duration: 1,
    load_duration: huge,
    total_duration: huge,
  }).flat();
  assert.equal(all.length, 6);
  assert.equal(new Set(all.map((button) => button.custom_id)).size, 6);
  assert.ok(all.every((button) => button.custom_id.length <= 100));
  assert.ok(all.every((button) => (button.label?.length ?? 0) <= 80));
  assert.equal(all[0]?.label, `${"m".repeat(79)}…`);
});

test("statsComponents rounds durations before picking a unit", () => {
  setShowStats("true");
  const load = (nanoseconds: number) =>
    labels({ load_duration: nanoseconds })[0]?.[0];
  assert.equal(load(999_400_000), "999 ms load");
  assert.equal(load(999_600_000), "1.0 s load");
  assert.equal(load(59_940_000_000), "59.9 s load");
  assert.equal(load(59_960_000_000), "1 min 0 s load");
  assert.equal(load(125_400_000_000), "2 min 5 s load");
});

test("replyWithStats answers a click with a private breakdown", async () => {
  setShowStats("true");
  const { flags, embed } = await breakdown(
    buttons(stats)[0]?.[1]?.custom_id ?? "",
  );
  assert.equal(flags, MessageFlags.Ephemeral);
  assert.equal(embed?.title, "Generation stats");
  assert.deepEqual(embed?.fields, [
    { name: "Prompt", value: "1,024 tokens · 354 ms · 2,892.7 tokens/s" },
    { name: "Response", value: "256 tokens · 6.1 s · 42.1 tokens/s" },
    { name: "Load time", value: "13 ms" },
    { name: "Total time", value: "6.3 s" },
  ]);
});

test("replyWithStats shows the same breakdown from every button of an answer", async () => {
  setShowStats("true");
  const breakdowns = await Promise.all(
    buttons(stats)
      .flat()
      .map(async (button) => (await breakdown(button.custom_id)).embed),
  );
  assert.equal(breakdowns.length, 6);
  assert.equal(
    new Set(breakdowns.map((embed) => JSON.stringify(embed))).size,
    1,
  );
});

test("replyWithStats explains when a button carries no stats", async () => {
  const interaction = fakeClick("stats:tokens:x!::::");
  await replyWithStats(interaction as unknown as ButtonInteraction);
  assert.deepEqual(interaction.reply.mock.calls[0]?.arguments, [
    {
      content: "No stats are available for this answer.",
      flags: MessageFlags.Ephemeral,
    },
  ]);
});
