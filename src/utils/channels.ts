import type { BaseInteraction } from "discord.js";
import { getConfig } from "../config.js";

export async function isChannelAllowed(
  interaction: BaseInteraction,
): Promise<boolean> {
  const { channels } = getConfig();
  if (channels.length === 0 || !interaction.inGuild()) return true;

  const { channelId } = interaction;
  if (!channelId) return false;
  if (channels.includes(channelId)) return true;

  const channel =
    interaction.channel ??
    (await interaction.client.channels.fetch(channelId).catch(() => null));
  return !!channel?.isThread() && channels.includes(channel.parentId ?? "");
}
