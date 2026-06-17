import { Client, GatewayIntentBits, Partials } from "discord.js";
import { log, setLogger, Logger, LogLevel } from "./utils/logger.js";
import type { ShardMessage } from "./types.js";
import { getConfig } from "./config.js";
import { registerEvents } from "./events/index.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  allowedMentions: { users: [], roles: [], repliedUser: false },
  partials: [Partials.Channel],
});

process.on("message", (data: ShardMessage) => {
  if (!data || typeof data !== "object") return;
  if (data.shardID !== undefined)
    client.shardID = data.shardID;
  if (data.logger) setLogger(new Logger(data.logger));
});

registerEvents(client);

void client.login(getConfig().token).catch((error) => {
  log.log(LogLevel.Error, "Failed to login to Discord", error);
  process.exit(1);
});
