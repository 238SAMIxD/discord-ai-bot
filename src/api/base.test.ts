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
  requestCount(): number;
}

setLogger(new Logger(true, "base.test"));

async function startFakeOllama(
  t: TestContext,
  name: string,
  status = 200,
): Promise<FakeOllama> {
  const streams = new Map<ServerResponse, NodeJS.Timeout>();
  const streamEvents = new EventEmitter();
  let requests = 0;
  const chunk = (done: boolean) =>
    JSON.stringify({ message: { content: name }, done }) + "\n";

  const server = createServer(async (req, res) => {
    requests++;
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
    requestCount: () => requests,
  };
}

function toServers(...fakes: FakeOllama[]): Server[] {
  return fakes.map((fake) => ({ url: fake.url, available: true }));
}

function openStream(
  servers: Server[],
  idleTimeoutMs = 0,
  signal?: AbortSignal,
) {
  return makeBaseRequest<Readable>(
    servers,
    "/api/chat",
    "post",
    { stream: true },
    "stream",
    0,
    0,
    idleTimeoutMs,
    signal,
  );
}

function chat(servers: Server[], waitTimeoutMs = 1_000, signal?: AbortSignal) {
  return makeBaseRequest<ChatChunk>(
    servers,
    "/api/chat",
    "post",
    { stream: false },
    "json",
    0,
    waitTimeoutMs,
    0,
    signal,
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

function wakeWaiters(fake: FakeOllama) {
  return chat(toServers(fake));
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
  const upstreamClosed = a.streamClosed();
  await delay(50);

  stream.destroy();
  await consumed;
  await upstreamClosed;

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
  const stalledAt = Date.now();

  a.stallStreams();
  const { error } = await consumed;
  const elapsed = Date.now() - stalledAt;
  await upstreamClosed;

  assert.ok(error);
  assert.match(error.message, /Stream idle/);
  assert.ok(elapsed < 500);
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

test("makeBaseRequest caps timeouts above the maximum timer delay", async (t) => {
  const a = await startFakeOllama(t, "A");
  const servers = toServers(a);

  const stream = await openStream(servers, 2 ** 32);
  const consumed = consume(stream);
  const reply = chat(servers, 2 ** 32);

  assert.equal(await isPending(reply, 100), true);

  a.finishStreams();
  const { error } = await consumed;
  assert.equal(error, undefined);
  assert.equal((await reply).message.content, "A");
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

test("makeBaseRequest waits for a busy server instead of failing when the others fail", async (t) => {
  const a = await startFakeOllama(t, "A", 500);
  const b = await startFakeOllama(t, "B");
  const servers = toServers(a, b);

  const stream = await openStream(servers);
  const consumed = consume(stream);
  const replies = [chat(servers), chat(servers)];

  assert.equal(await isPending(Promise.any(replies), 200), true);
  assert.equal(a.requestCount(), 3);

  b.finishStreams();
  await consumed;
  const contents = (await Promise.all(replies)).map((r) => r.message.content);
  assert.deepEqual(contents, ["B", "B"]);
  assert.equal(a.requestCount(), 3);

  const nextConsumed = consume(await openStream(servers));
  await assert.rejects(chat(servers, 100), {
    name: "AxiosError",
    status: 500,
  });

  b.finishStreams();
  await nextConsumed;
});

test("makeBaseRequest gives up once the wait timeout passes", async (t) => {
  const a = await startFakeOllama(t, "A");
  const servers = toServers(a);

  const stream = await openStream(servers);
  const consumed = consume(stream);
  const startedAt = Date.now();

  await assert.rejects(chat(servers, 100), /All servers busy/);
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed >= 100);
  assert.ok(elapsed < 500);
  await assert.rejects(chat(servers, 50.5), /All servers busy/);

  a.finishStreams();
  await consumed;
});

test("makeBaseRequest stops waiting for a server once its signal aborts", async (t) => {
  const a = await startFakeOllama(t, "A");
  const servers = toServers(a);
  const controller = new AbortController();

  const stream = await openStream(servers);
  const consumed = consume(stream);
  const reply = chat(servers, 0, controller.signal);

  assert.equal(await isPending(reply, 50), true);
  controller.abort();
  await assert.rejects(reply, { name: "AbortError" });
  assert.equal(a.requestCount(), 1);

  a.finishStreams();
  await consumed;
});

test("makeBaseRequest closes its stream and releases the server once its signal aborts", async (t) => {
  const a = await startFakeOllama(t, "A");
  const servers = toServers(a);
  const controller = new AbortController();

  const stream = await openStream(servers, 0, controller.signal);
  const consumed = consume(stream);
  const upstreamClosed = a.streamClosed();
  await delay(50);

  controller.abort();
  const { error } = await consumed;
  await upstreamClosed;

  assert.ok(error);
  assert.equal(servers[0].available, true);
  assert.equal((await chat(servers)).message.content, "A");
});

async function startHeldServer(t: TestContext) {
  const requests = new EventEmitter();
  const server = createServer(() => {
    requests.emit("request");
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    nextRequest: () => once(requests, "request"),
  };
}

test("makeBaseRequest runs onAbort while it still holds the server, then releases it", async (t) => {
  const held = await startHeldServer(t);
  const servers: Server[] = [{ url: held.url, available: true }];
  const controller = new AbortController();
  const heldDuringAbort: boolean[] = [];

  const received = held.nextRequest();
  const reply = makeBaseRequest(
    servers,
    "/sdapi/v1/txt2img",
    "post",
    {},
    "json",
    0,
    0,
    0,
    controller.signal,
    async (server) => {
      heldDuringAbort.push(server === servers[0] && !server.available);
    },
  );
  await received;
  controller.abort();

  await assert.rejects(reply, { name: "AbortError" });
  assert.deepEqual(heldDuringAbort, [true]);
  assert.equal(servers[0].available, true);
});

test("makeBaseRequest doesn't run onAbort when a request fails without being aborted", async (t) => {
  const a = await startFakeOllama(t, "A", 500);
  const onAbort = t.mock.fn(async () => undefined);

  await assert.rejects(
    makeBaseRequest(
      toServers(a),
      "/api/chat",
      "post",
      { stream: false },
      "json",
      0,
      0,
      0,
      new AbortController().signal,
      onAbort,
    ),
    { name: "AxiosError", status: 500 },
  );
  assert.equal(onAbort.mock.callCount(), 0);
});

test(
  "makeBaseRequest waits up to 60 seconds for a free server by default",
  { timeout: 5_000 },
  async (t) => {
    const a = await startFakeOllama(t, "A");
    const b = await startFakeOllama(t, "B");
    const servers = toServers(a);

    const stream = await openStream(servers);
    const consumed = consume(stream);
    t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
    const reply = makeBaseRequest<ChatChunk>(servers, "/api/chat", "post", {
      stream: false,
    });

    t.mock.timers.tick(59_000);
    await wakeWaiters(b);
    assert.equal(await isPending(reply, 50), true);

    t.mock.timers.tick(1_000);
    await wakeWaiters(b);
    await assert.rejects(reply, /All servers busy/);

    a.finishStreams();
    await consumed;
  },
);

test(
  "makeBaseRequest with a wait timeout of 0 waits until the server frees up",
  { timeout: 5_000 },
  async (t) => {
    const a = await startFakeOllama(t, "A");
    const b = await startFakeOllama(t, "B");
    const servers = toServers(a);

    const stream = await openStream(servers);
    const consumed = consume(stream);
    t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
    const reply = chat(servers, 0);

    t.mock.timers.tick(30 * 24 * 60 * 60 * 1_000);
    await wakeWaiters(b);
    assert.equal(await isPending(reply, 300), true);

    a.finishStreams();
    await consumed;
    assert.equal((await reply).message.content, "A");
  },
);
