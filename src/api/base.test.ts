import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { createServer, type ServerResponse } from "node:http";
import { text } from "node:stream/consumers";
import { setTimeout as delay } from "node:timers/promises";
import { makeBaseRequest } from "./base.js";
import { Logger, setLogger } from "../utils/logger.js";

import type { AddressInfo } from "node:net";
import type { Readable } from "node:stream";
import type { Server } from "../types.js";

interface ChatChunk {
  message: { content: string };
  done: boolean;
}

interface FakeOllama {
  url: string;
  finishStreams(): void;
  breakStreams(): void;
  stallStreams(): void;
  streamClosed(): Promise<unknown>;
}

setLogger(new Logger(true, "base.test"));

async function startFakeOllama(
  t: TestContext,
  name: string,
  status = 200,
): Promise<FakeOllama> {
  const streams = new Map<ServerResponse, NodeJS.Timeout>();
  const streamEvents = new EventEmitter();
  const chunk = (done: boolean) =>
    JSON.stringify({ message: { content: name }, done }) + "\n";

  const server = createServer(async (req, res) => {
    const { stream } = JSON.parse(await text(req)) as { stream: boolean };

    if (status !== 200) {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `${name} failed` }));
      return;
    }

    if (!stream) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(chunk(true));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/x-ndjson" });
    res.write(chunk(false));
    const interval = setInterval(() => res.write(chunk(false)), 25);
    streams.set(res, interval);
    res.on("close", () => {
      clearInterval(interval);
      streams.delete(res);
      streamEvents.emit("closed");
    });
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  const closeStreams = (close: (res: ServerResponse) => void) => {
    for (const [res, interval] of streams) {
      clearInterval(interval);
      close(res);
    }
    streams.clear();
  };

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    finishStreams: () => closeStreams((res) => res.end(chunk(true))),
    breakStreams: () => closeStreams((res) => res.destroy()),
    stallStreams: () => {
      for (const interval of streams.values()) clearInterval(interval);
    },
    streamClosed: () => once(streamEvents, "closed"),
  };
}

function toServers(...fakes: FakeOllama[]): Server[] {
  return fakes.map((fake) => ({ url: fake.url, available: true }));
}

function openStream(servers: Server[], idleTimeoutMs = 0) {
  return makeBaseRequest<Readable>(
    servers,
    "/api/chat",
    "post",
    { stream: true },
    "stream",
    0,
    0,
    idleTimeoutMs,
  );
}

function chat(servers: Server[], waitTimeoutMs = 1_000) {
  return makeBaseRequest<ChatChunk>(
    servers,
    "/api/chat",
    "post",
    { stream: false },
    "json",
    0,
    waitTimeoutMs,
  );
}

function consume(stream: Readable): Promise<{ body: string; error?: Error }> {
  return new Promise((resolve) => {
    let body = "";
    let error: Error | undefined;
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => (body += chunk));
    stream.on("error", (err: Error) => (error = err));
    stream.on("close", () => resolve({ body, error }));
  });
}

function isPending(promise: Promise<unknown>, ms: number) {
  return Promise.race([promise.then(() => false), delay(ms, true)]);
}

test("makeBaseRequest sends a request to the next server while a stream holds the first", async (t) => {
  const a = await startFakeOllama(t, "A");
  const b = await startFakeOllama(t, "B");
  const servers = toServers(a, b);

  const stream = await openStream(servers);
  const consumed = consume(stream);
  const reply = await chat(servers);

  assert.equal(reply.message.content, "B");
  assert.equal(servers[0].available, false);
  assert.equal(servers[1].available, true);

  a.finishStreams();
  await consumed;
});

test("makeBaseRequest waits while a stream holds the only server", async (t) => {
  const a = await startFakeOllama(t, "A");
  const servers = toServers(a);

  const stream = await openStream(servers);
  const consumed = consume(stream);
  const reply = chat(servers);

  assert.equal(await isPending(reply, 100), true);

  a.finishStreams();
  await consumed;
  assert.equal((await reply).message.content, "A");
});

test("makeBaseRequest releases the server once its stream ends", async (t) => {
  const a = await startFakeOllama(t, "A");
  const b = await startFakeOllama(t, "B");
  const servers = toServers(a, b);

  const stream = await openStream(servers);
  const consumed = consume(stream);
  await delay(100);
  assert.equal(servers[0].available, false);

  a.finishStreams();
  const { body, error } = await consumed;
  const chunks = body
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as ChatChunk);

  assert.equal(error, undefined);
  assert.ok(chunks.length > 2);
  assert.equal(chunks.at(-1)?.done, true);
  assert.equal(servers[0].available, true);
  assert.equal((await chat(servers)).message.content, "A");
});

test("makeBaseRequest releases the server when the stream is destroyed early", async (t) => {
  const a = await startFakeOllama(t, "A");
  const servers = toServers(a);

  const stream = await openStream(servers);
  const consumed = consume(stream);
  await delay(50);

  stream.destroy();
  await consumed;

  assert.equal(servers[0].available, true);
  assert.equal((await chat(servers)).message.content, "A");
});

test("makeBaseRequest releases the server when the stream errors", async (t) => {
  const a = await startFakeOllama(t, "A");
  const servers = toServers(a);

  const stream = await openStream(servers);
  const consumed = consume(stream);
  await delay(50);

  a.breakStreams();
  const { error } = await consumed;

  assert.ok(error);
  assert.equal(servers[0].available, true);
  assert.equal((await chat(servers)).message.content, "A");
});

test("makeBaseRequest aborts a stream that goes idle and releases its server", async (t) => {
  const a = await startFakeOllama(t, "A");
  const servers = toServers(a);

  const stream = await openStream(servers, 100);
  const consumed = consume(stream);
  const upstreamClosed = a.streamClosed();

  a.stallStreams();
  const { error } = await consumed;
  await upstreamClosed;

  assert.ok(error);
  assert.match(error.message, /Stream idle/);
  assert.equal(servers[0].available, true);
  assert.equal((await chat(servers)).message.content, "A");
});

test("makeBaseRequest keeps a stream open while data keeps arriving", async (t) => {
  const a = await startFakeOllama(t, "A");
  const servers = toServers(a);

  const stream = await openStream(servers, 200);
  const consumed = consume(stream);
  await delay(400);
  assert.equal(servers[0].available, false);

  a.finishStreams();
  const { error } = await consumed;

  assert.equal(error, undefined);
  assert.equal(servers[0].available, true);
});

test("makeBaseRequest releases a server whose request failed and tries the next one", async (t) => {
  const a = await startFakeOllama(t, "A", 500);
  const b = await startFakeOllama(t, "B");
  const servers = toServers(a, b);

  const stream = await openStream(servers);
  const consumed = consume(stream);

  assert.equal(servers[0].available, true);
  assert.equal(servers[1].available, false);

  b.finishStreams();
  assert.match((await consumed).body, /"content":"B"/);
  assert.equal(servers[1].available, true);

  await assert.rejects(openStream(toServers(a)), {
    name: "AxiosError",
    status: 500,
  });
});

test("makeBaseRequest gives up once the wait timeout passes", async (t) => {
  const a = await startFakeOllama(t, "A");
  const servers = toServers(a);

  const stream = await openStream(servers);
  const consumed = consume(stream);
  const startedAt = Date.now();

  await assert.rejects(chat(servers, 100), /All servers busy/);
  assert.ok(Date.now() - startedAt >= 100);

  a.finishStreams();
  await consumed;
});

test(
  "makeBaseRequest with a wait timeout of 0 waits until the server frees up",
  { timeout: 5_000 },
  async (t) => {
    const a = await startFakeOllama(t, "A");
    const servers = toServers(a);

    const stream = await openStream(servers);
    const consumed = consume(stream);
    const reply = chat(servers, 0);

    assert.equal(await isPending(reply, 300), true);

    a.finishStreams();
    await consumed;
    assert.equal((await reply).message.content, "A");
  },
);
