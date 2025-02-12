import { Events, ShardingManager } from "discord.js";
import dotenv from "dotenv";
import { Logger, LogLevel } from "meklog";
import path from "node:path";

dotenv.config();

if (!process.env.DISCORD_TOKEN) {
  throw new Error("DISCORD_TOKEN is not defined in the environment variables.");
}

const production = process.env.NODE_ENV === "prod" || process.env.NODE_ENV === "production";
const log = Logger(production, "Shard Manager");

log(LogLevel.Info, "Loading");

const filePath = path.join(__dirname, "bot.ts");
const manager = new ShardingManager(filePath, {
  token: process.env.DISCORD_TOKEN,
  execArgv: ["-r", "ts-node/register"],
});

manager.on("shardCreate", async shard => {
  const shardLog = Logger(production, `Shard #${shard.id}`);

  shardLog(LogLevel.Info, "Created shard");

  shard.once(Events.ClientReady, async () => {
    shard.send({ shardID: shard.id, logger: shardLog.data });

    shardLog(LogLevel.Info, "Shard ready");
  });
});

manager.spawn();
