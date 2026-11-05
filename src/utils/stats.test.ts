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

test("statsComponents shows how much of the loaded context the answer fills", () => {
  setShowStats("true");
  const [, contextRow] = buttons({ ...stats, context_length: 4096 });
  assert.deepEqual(
    contextRow?.map((button) => [
      button.emoji?.name,
      button.label,
      button.style,
    ]),
    [
      ["📥", "1,024 prompt tokens", ButtonStyle.Secondary],
      ["🧠", "1,280 / 4,096 ctx", ButtonStyle.Secondary],
      ["💾", "13 ms load", ButtonStyle.Secondary],
      ["⌛", "6.3 s total", ButtonStyle.Secondary],
    ],
  );
});

test("statsComponents warns once the context is at least 90% full", () => {
  setShowStats("true");
  const contextStyle = (prompt: number) =>
    buttons({ prompt_eval_count: prompt, eval_count: 0, context_length: 1000 })
      .flat()
      .find((button) => button.custom_id.startsWith("stats:context:"))?.style;
  assert.equal(contextStyle(899), ButtonStyle.Secondary);
  assert.equal(contextStyle(900), ButtonStyle.Danger);
  assert.equal(contextStyle(1500), ButtonStyle.Danger);
});

test("statsComponents hides the context button without all of its stats", () => {
  setShowStats("true");
  const hasContext = (value: OllamaStats) =>
    buttons(value)
      .flat()
      .some((button) => button.custom_id.startsWith("stats:context:"));
  assert.equal(hasContext(stats), false);
  assert.equal(hasContext({ ...stats, context_length: 0 }), false);
  assert.equal(
    hasContext({ ...stats, eval_count: undefined, context_length: 4096 }),
    false,
  );
  assert.equal(
    hasContext({
      ...stats,
      prompt_eval_count: undefined,
      context_length: 4096,
    }),
    false,
  );
  assert.equal(hasContext({ ...stats, context_length: 4096 }), true);
});

test("replyWithStats shows the context use from any button of the answer", async () => {
  setShowStats("true");
  const all = buttons({ ...stats, context_length: 4096 }).flat();
  for (const button of all) {
    const { embed } = await breakdown(button.custom_id);
    assert.deepEqual(embed?.fields?.[2], {
      name: "Context",
      value: "1,280 / 4,096 tokens (31%)",
    });
  }
});

test("replyWithStats caps the context share at 100%", async () => {
  setShowStats("true");
  const [button] = buttons({
    prompt_eval_count: 5000,
    eval_count: 200,
    context_length: 4096,
  }).flat();
  const { embed } = await breakdown(button?.custom_id ?? "");
  assert.deepEqual(
    embed?.fields?.find((field) => field.name === "Context"),
    { name: "Context", value: "5,200 / 4,096 tokens (100%)" },
  );
});

test("replyWithStats still reads buttons made before the context stat", async () => {
  const { embed } = await breakdown(
    "stats:tokens:sg:5urg5c:74:2sjvi0w:7qmv4:2w6uv40",
  );
  assert.deepEqual(embed?.fields, [
    { name: "Prompt", value: "1,024 tokens · 354 ms · 2,892.7 tokens/s" },
    { name: "Response", value: "256 tokens · 6.1 s · 42.1 tokens/s" },
    { name: "Load time", value: "13 ms" },
    { name: "Total time", value: "6.3 s" },
  ]);
});

test("statsComponents keeps every button ID within Discord's limit at the largest values", () => {
  setShowStats("true");
  const huge = Number.MAX_SAFE_INTEGER;
  const half = Math.floor(huge / 2);
  const all = buttons({
    model: "m".repeat(200),
    prompt_eval_count: half,
    prompt_eval_duration: huge,
    eval_count: half,
    eval_duration: huge,
    load_duration: huge,
    total_duration: huge,
    context_length: huge,
  }).flat();
  assert.equal(all.length, 7);
  assert.ok(
    all.some((button) => button.custom_id.startsWith("stats:context:")),
  );
  assert.equal(new Set(all.map((button) => button.custom_id)).size, 7);
  assert.ok(all.every((button) => button.custom_id.length <= 100));
  assert.ok(all.every((button) => (button.label?.length ?? 0) <= 80));
});
