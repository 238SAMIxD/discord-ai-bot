import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { logError } from "./logger.js";

import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
} from "discord.js";

export interface StopButton {
  signal: AbortSignal;
  show(): Promise<void>;
  complete(): void;
  finish(markStopped?: boolean): Promise<void>;
}

interface RunningRequest {
  userId: string;
  controller: AbortController;
}

const STOP_PREFIX = "stop:";

const running = new Map<string, RunningRequest>();

function stopButtonRow(interactionId: string, stopped: boolean) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${STOP_PREFIX}${interactionId}`)
      .setEmoji("⏹️")
      .setLabel(stopped ? "Stopped" : "Stop")
      .setStyle(stopped ? ButtonStyle.Secondary : ButtonStyle.Danger)
      .setDisabled(stopped),
  );
}

export function createStopButton(
  interaction: ChatInputCommandInteraction,
): StopButton {
  const controller = new AbortController();
  running.set(interaction.id, { userId: interaction.user.id, controller });
  let shown = false;

  return {
    signal: controller.signal,
    async show() {
      await interaction.editReply({
        content: "Generating…",
        components: [stopButtonRow(interaction.id, false)],
      });
      shown = true;
    },
    complete() {
      running.delete(interaction.id);
    },
    async finish(markStopped = false) {
      running.delete(interaction.id);
      if (!shown) return;
      await interaction
        .editReply({
          components: markStopped ? [stopButtonRow(interaction.id, true)] : [],
        })
        .catch(logError);
    },
  };
}

export function isStopButton(interaction: ButtonInteraction): boolean {
  return interaction.customId.startsWith(STOP_PREFIX);
}

export async function handleStopButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const request = running.get(interaction.customId.slice(STOP_PREFIX.length));
  if (!request) {
    await interaction.reply({
      content: "This response is no longer running.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (request.userId !== interaction.user.id) {
    await interaction.reply({
      content: "Only the person who ran this command can stop it.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  request.controller.abort();
  await interaction.deferUpdate();
}
