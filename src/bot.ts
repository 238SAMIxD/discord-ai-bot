import { Client, GatewayIntentBits, Partials } from "discord.js";
import { setLogger } from "./utils/logger.js";
import { Logger } from "./types.js";
import type { ShardMessage } from "./types.js";
import { config } from "./config.js";
import { registerEvents } from "./events/index.js";

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.MessageContent
	],
	allowedMentions: { users: [], roles: [], repliedUser: false },
	partials: [
		Partials.Channel
	]
});

process.on("message", (data: ShardMessage) => {
	if (data.shardID !== undefined) (client as { shardID?: number }).shardID = data.shardID;
	if (data.logger) setLogger(new Logger(data.logger));
});

registerEvents(client);

client.login(config.token);
