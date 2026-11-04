import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Collection } from "discord.js";
import { stopShards } from "./shards.js";

import type { ShardingManager } from "discord.js";

function fakeChild(exitOn: NodeJS.Signals) {
  const child = Object.assign(new EventEmitter(), {
    exited: false,
    kill: mock.fn((signal: NodeJS.Signals) => {
      if (signal === exitOn) {
        setImmediate(() => {
          child.exited = true;
          child.emit("exit");
        });
      }
      return true;
    }),
  });
  return child;
}

type FakeChild = ReturnType<typeof fakeChild>;

function fakeManager(...children: (FakeChild | null)[]) {
  return {
    respawn: true,
    shards: new Collection(
      children.map((child, id) => [id, { process: child }] as const),
    ),
  };
}

function killSignals(child: FakeChild): NodeJS.Signals[] {
  return child.kill.mock.calls.map((call) => call.arguments[0]);
}

test("stopShards turns off respawning and waits for every shard to exit after SIGTERM", async () => {
  const first = fakeChild("SIGTERM");
  const second = fakeChild("SIGTERM");
  const manager = fakeManager(first, null, second);

  await stopShards(manager as unknown as ShardingManager, 20);

  assert.equal(manager.respawn, false);
  assert.equal(first.exited, true);
  assert.equal(second.exited, true);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(killSignals(first), ["SIGTERM"]);
  assert.deepEqual(killSignals(second), ["SIGTERM"]);
});

test("stopShards kills a shard that is still running after the timeout", async () => {
  const stuck = fakeChild("SIGKILL");
  const manager = fakeManager(stuck);

  await stopShards(manager as unknown as ShardingManager, 20);

  assert.equal(stuck.exited, true);
  assert.deepEqual(killSignals(stuck), ["SIGTERM", "SIGKILL"]);
});
