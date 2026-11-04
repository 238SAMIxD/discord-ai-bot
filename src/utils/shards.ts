import type { ChildProcess } from "node:child_process";
import type { ShardingManager } from "discord.js";

function stopShardProcess(child: ChildProcess, timeout: number): Promise<void> {
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
  await Promise.all(
    manager.shards.map((shard) =>
      shard.process ? stopShardProcess(shard.process, timeout) : undefined,
    ),
  );
}
