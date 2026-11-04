import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Collection } from "discord.js";
import { stopShards } from "./shards.js";

import type { ShardingManager } from "discord.js";

function fakeChild(exitOn: NodeJS.Signals, delay = 0) {
  const child = Object.assign(new EventEmitter(), {
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    exited: false,
    kill: mock.fn((signal: NodeJS.Signals) => {
      if (signal === exitOn) {
        setTimeout(() => {
          child.exited = true;
          child.emit("exit");
        }, delay);
      }
      return true;
    }),
  });
  return child;
}

type FakeChild = ReturnType<typeof fakeChild>;

function fakeManager(...children: (FakeChild | null)[]) {
  return Object.assign(new EventEmitter(), {
    respawn: true,
    shards: new Collection(
      children.map((child, id) => [id, { process: child }] as const),
    ),
  });
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

test("stopShards does not signal or wait for a shard process that already exited", async () => {
  const exited = Object.assign(fakeChild("SIGKILL"), { exitCode: 0 });
  const manager = fakeManager(exited);

  await stopShards(manager as unknown as ShardingManager, 20);

  assert.deepEqual(killSignals(exited), []);
});

test("stopShards also stops and waits for a shard started during shutdown", async () => {
  const first = fakeChild("SIGTERM", 10);
  const manager = fakeManager(first);
  const stopping = stopShards(manager as unknown as ShardingManager, 1000);

  const late = fakeChild("SIGTERM", 40);
  const lateShard = Object.assign(new EventEmitter(), {
    process: null as FakeChild | null,
  });
  manager.emit("shardCreate", lateShard);
  lateShard.process = late;
  lateShard.emit("spawn", late);
  await stopping;

  assert.deepEqual(killSignals(late), ["SIGTERM"]);
  assert.equal(late.exited, true);
});
