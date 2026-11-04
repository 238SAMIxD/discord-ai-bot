import type { ChildProcess } from "node:child_process";
import type { Shard, ShardingManager } from "discord.js";

function stopShardProcess(child: ChildProcess, timeout: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

export async function stopShards(
  manager: ShardingManager,
  timeout = 8_000,
): Promise<void> {
  manager.respawn = false;
  const stopping: Promise<void>[] = [];
  const stopShard = (shard: Shard) => {
    if (shard.process) stopping.push(stopShardProcess(shard.process, timeout));
  };
  manager.on("shardCreate", (shard) => {
    shard.once("spawn", () => stopShard(shard));
  });
  manager.shards.forEach(stopShard);

  let waited = 0;
  while (waited < stopping.length) {
    const pending = stopping.slice(waited);
    waited = stopping.length;
    await Promise.all(pending);
  }
}
