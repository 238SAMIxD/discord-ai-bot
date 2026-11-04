import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { getConfig } from "../config.js";

import type { ButtonInteraction } from "discord.js";
import type { OllamaStats } from "../types.js";

const STATS_BUTTON_PREFIX = "stats:";

const PACKED_FIELDS = [
  "prompt_eval_count",
  "prompt_eval_duration",
  "eval_count",
  "eval_duration",
  "load_duration",
  "total_duration",
  "context_length",
] as const;

const CONTEXT_WARNING_SHARE = 0.9;

const MAX_LABEL_LENGTH = 80;

type PackedStats = Pick<OllamaStats, (typeof PACKED_FIELDS)[number]>;

interface StatButton {
  key: string;
  emoji: string;
  label: string;
  style: ButtonStyle;
}

interface StatField {
  name: string;
  value: string | null;
}

const countFormat = new Intl.NumberFormat("en-US");
const speedFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function isStat(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0;
}

function formatCount(count: number, unit: string): string {
  return `${countFormat.format(count)} ${unit}${count === 1 ? "" : "s"}`;
}

function formatDuration(nanoseconds: number): string {
  const milliseconds = Math.round(nanoseconds / 1e6);
  if (milliseconds < 1000) return `${milliseconds} ms`;
  const tenths = Math.round(nanoseconds / 1e8);
  if (tenths < 600) return `${(tenths / 10).toFixed(1)} s`;
  const seconds = Math.round(nanoseconds / 1e9);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function formatSpeed(
  count: number | undefined,
  nanoseconds: number | undefined,
): string | null {
  if (!isStat(count) || !isStat(nanoseconds) || nanoseconds === 0) {
    return null;
  }
  return `${speedFormat.format(count / (nanoseconds / 1e9))} tokens/s`;
}

function contextUsage(
  stats: PackedStats,
): { used: number; size: number } | null {
  const { prompt_eval_count, eval_count, context_length } = stats;
  if (!isStat(prompt_eval_count) || !isStat(eval_count)) return null;
  if (!isStat(context_length) || context_length === 0) return null;
  const used = prompt_eval_count + eval_count;
  return isStat(used) ? { used, size: context_length } : null;
}

function describeContext(stats: PackedStats): string | null {
  const usage = contextUsage(stats);
  if (!usage) return null;
  const percent = Math.min(100, Math.round((usage.used / usage.size) * 100));
  return `${countFormat.format(usage.used)} / ${countFormat.format(usage.size)} tokens (${percent}%)`;
}

function truncate(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function packStats(stats: PackedStats): string {
  return PACKED_FIELDS.map((field) => {
    const value = stats[field];
    return isStat(value) ? value.toString(36) : "";
  }).join(":");
}

function unpackStats(customId: string): PackedStats {
  const values = customId.slice(STATS_BUTTON_PREFIX.length).split(":").slice(1);
  const stats: PackedStats = {};
  PACKED_FIELDS.forEach((field, index) => {
    const value = values[index] ?? "";
    const parsed = /^[0-9a-z]+$/.test(value) ? parseInt(value, 36) : NaN;
    if (isStat(parsed)) stats[field] = parsed;
  });
  return stats;
}

function statButtons(stats: OllamaStats): StatButton[][] {
  const answer: StatButton[] = [];
  const context: StatButton[] = [];
  const model = stats.model?.trim();
  if (model) {
    answer.push({
      key: "model",
      emoji: "🤖",
      label: truncate(model, MAX_LABEL_LENGTH),
      style: ButtonStyle.Secondary,
    });
  }
  if (isStat(stats.eval_count)) {
    answer.push({
      key: "tokens",
      emoji: "📝",
      label: formatCount(stats.eval_count, "token"),
      style: ButtonStyle.Primary,
    });
  }
  const speed = formatSpeed(stats.eval_count, stats.eval_duration);
  if (speed) {
    answer.push({
      key: "speed",
      emoji: "⚡",
      label: speed,
      style: ButtonStyle.Success,
    });
  }
  if (isStat(stats.prompt_eval_count)) {
    context.push({
      key: "prompt",
      emoji: "📥",
      label: formatCount(stats.prompt_eval_count, "prompt token"),
      style: ButtonStyle.Secondary,
    });
  }
  const usage = contextUsage(stats);
  if (usage) {
    context.push({
      key: "context",
      emoji: "🧠",
      label: `${countFormat.format(usage.used)} / ${countFormat.format(usage.size)} ctx`,
      style:
        usage.used >= usage.size * CONTEXT_WARNING_SHARE
          ? ButtonStyle.Danger
          : ButtonStyle.Secondary,
    });
  }
  if (isStat(stats.load_duration)) {
    context.push({
      key: "load",
      emoji: "💾",
      label: `${formatDuration(stats.load_duration)} load`,
      style: ButtonStyle.Secondary,
    });
  }
  if (isStat(stats.total_duration)) {
    context.push({
      key: "total",
      emoji: "⌛",
      label: `${formatDuration(stats.total_duration)} total`,
      style: ButtonStyle.Secondary,
    });
  }
  return [answer, context].filter((row) => row.length > 0);
}

export function statsComponents(
  stats: OllamaStats | undefined,
): ActionRowBuilder<ButtonBuilder>[] {
  if (!stats || !getConfig().showStats) return [];
  if (!PACKED_FIELDS.some((field) => isStat(stats[field]))) return [];
  const packed = packStats(stats);
  return statButtons(stats).map((row) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      row.map(({ key, emoji, label, style }) =>
        new ButtonBuilder()
          .setCustomId(`${STATS_BUTTON_PREFIX}${key}:${packed}`)
          .setEmoji(emoji)
          .setLabel(label)
          .setStyle(style),
      ),
    ),
  );
}

function describeTokens(
  count: number | undefined,
  nanoseconds: number | undefined,
): string | null {
  if (!isStat(count)) return null;
  const parts = [formatCount(count, "token")];
  if (isStat(nanoseconds)) parts.push(formatDuration(nanoseconds));
  const speed = formatSpeed(count, nanoseconds);
  if (speed) parts.push(speed);
  return parts.join(" · ");
}

function statsFields(stats: PackedStats): { name: string; value: string }[] {
  const fields: StatField[] = [
    {
      name: "Prompt",
      value: describeTokens(
        stats.prompt_eval_count,
        stats.prompt_eval_duration,
      ),
    },
    {
      name: "Response",
      value: describeTokens(stats.eval_count, stats.eval_duration),
    },
    {
      name: "Context",
      value: describeContext(stats),
    },
    {
      name: "Load time",
      value: isStat(stats.load_duration)
        ? formatDuration(stats.load_duration)
        : null,
    },
    {
      name: "Total time",
      value: isStat(stats.total_duration)
        ? formatDuration(stats.total_duration)
        : null,
    },
  ];
  return fields.filter(
    (field): field is { name: string; value: string } => field.value !== null,
  );
}

export async function replyWithStats(
  interaction: ButtonInteraction,
): Promise<void> {
  const fields = statsFields(unpackStats(interaction.customId));
  if (fields.length === 0) {
    await interaction.reply({
      content: "No stats are available for this answer.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("Generation stats")
        .setColor(Colors.Blurple)
        .addFields(fields),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

export function isStatsButton(interaction: ButtonInteraction): boolean {
  return interaction.customId.startsWith(STATS_BUTTON_PREFIX);
}
