import type { BaseInteraction, Client } from "discord.js";
import { getConfig } from "../config.js";
import { speakerName } from "./helpers.js";
import { log, LogLevel } from "./logger.js";

export interface BotProfile {
  description: string | null;
  bannerURL: string | null;
}

export interface BotContextInput {
  displayName: string;
  username: string;
  description?: string | null;
  avatarURL?: string | null;
  bannerURL?: string | null;
  guildName?: string | null;
  channelName?: string | null;
  channelTopic?: string | null;
  requester?: string | null;
  now?: Date;
}

let descriptionPromise: Promise<string | null> | null = null;
let bannerPromise: Promise<string | null> | null = null;

async function fetchDescription(client: Client): Promise<string | null> {
  if (!client.application) {
    log.log(
      LogLevel.Warn,
      "Bot application is not available; the bot description is left out of the system prompt",
    );
    return null;
  }
  try {
    const application = await client.application.fetch();
    return application.description?.trim() || null;
  } catch (e) {
    descriptionPromise = null;
    log.log(LogLevel.Debug, "Could not fetch application description", e);
    return null;
  }
}

async function fetchBanner(client: Client): Promise<string | null> {
  try {
    const user = await client.user?.fetch(true);
    return user?.bannerURL() ?? null;
  } catch (e) {
    bannerPromise = null;
    log.log(LogLevel.Debug, "Could not fetch bot banner", e);
    return null;
  }
}

export async function getBotProfile(client: Client): Promise<BotProfile> {
  descriptionPromise ??= fetchDescription(client);
  bannerPromise ??= fetchBanner(client);
  const [description, bannerURL] = await Promise.all([
    descriptionPromise,
    bannerPromise,
  ]);
  return { description, bannerURL };
}

export function resetBotProfileCache(): void {
  descriptionPromise = null;
  bannerPromise = null;
}

export function formatBotContext(input: BotContextInput): string {
  const lines: string[] = [];
  const identity =
    input.displayName && input.displayName !== input.username
      ? `${input.displayName} (@${input.username})`
      : `@${input.username}`;
  lines.push(`You are ${identity}, a Discord bot.`);
  if (input.description) lines.push(`About you: ${input.description}`);
  if (input.avatarURL) lines.push(`Your avatar: ${input.avatarURL}`);
  if (input.bannerURL) lines.push(`Your banner: ${input.bannerURL}`);
  if (input.guildName) {
    let where = `You are in the server "${input.guildName}"`;
    if (input.channelName) where += `, channel #${input.channelName}`;
    if (input.channelTopic) where += ` (topic: ${input.channelTopic})`;
    lines.push(`${where}.`);
  } else {
    lines.push("You are in a direct message.");
  }
  if (input.requester) lines.push(`You were asked by ${input.requester}.`);
  lines.push(
    `The current date and time is ${(input.now ?? new Date()).toUTCString()}.`,
  );
  return lines.join("\n");
}

export async function buildBotContext(
  interaction: BaseInteraction,
): Promise<string> {
  if (!getConfig().useBotContext) return "";
  const { client, guild, channel } = interaction;
  const user = client?.user;
  if (!user) return "";

  const profile = await getBotProfile(client);
  const channelName =
    channel && "name" in channel && typeof channel.name === "string"
      ? channel.name
      : null;
  const channelTopic =
    channel && "topic" in channel && typeof channel.topic === "string"
      ? channel.topic
      : null;

  return formatBotContext({
    displayName: guild?.members.me?.displayName ?? user.displayName,
    username: user.username,
    description: profile.description,
    avatarURL: user.displayAvatarURL(),
    bannerURL: profile.bannerURL,
    guildName: guild?.name ?? null,
    channelName,
    channelTopic,
    requester: speakerName(interaction),
  });
}
