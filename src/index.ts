import { ShardingManager } from "discord.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Logger, LogLevel } from "./types.js";
import type { ShardMessage } from "./types.js";

dotenv.config();

const production = process.env.NODE_ENV == "prod" || process.env.NODE_ENV == "production";
const log = new Logger(production, "Shard Manager");

log.log(LogLevel.Info, "Loading");

const currentFilePath = fileURLToPath(import.meta.url);
const isTs = currentFilePath.endsWith(".ts");
// Note: When built for production, currentFilePath is dist/index.js and isTs is false.
// This correctly resolves to dist/bot.js, ensuring the sharding manager runs the compiled code.
const filePath = path.join(path.dirname(currentFilePath), isTs ? "bot.ts" : "bot.js");
const token = process.env.TOKEN;

if (!token) {
	log.log(LogLevel.Error, "TOKEN environment variable is required");
	process.exit(1);
}

const manager = new ShardingManager(filePath, {
	token,
	execArgv: isTs ? ["--import", "tsx"] : []
});

manager.on("shardCreate", async (shard) => {
	const shardLog = new Logger(production, `Shard #${shard.id}`);

	shardLog.log(LogLevel.Info, "Created shard");

	shard.once("ready", async () => {
		const message: ShardMessage = { shardID: shard.id, logger: shardLog.data };
		try {
			await shard.send(message);
		} catch (error) {
			shardLog.log(LogLevel.Error, "Failed to send shard metadata to shard", error);
		}

		shardLog.log(LogLevel.Info, "Shard ready");
	});
});

manager.spawn().catch((error) => {
	log.log(LogLevel.Error, "Failed to spawn shards", error);
	process.exit(1);
});
