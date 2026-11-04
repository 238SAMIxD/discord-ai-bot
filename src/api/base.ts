import { EventEmitter, once } from "node:events";
import { pipeline, Transform } from "node:stream";
import axios, { type AxiosResponse } from "axios";

import { log, logError, LogLevel } from "../utils/logger.js";

import type { Readable } from "node:stream";
import type { Server } from "../types.js";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/**
 * Reports a queued request's place in line: how many requests wait ahead of
 * it (0 when it is next), or null once it got a server after waiting.
 */
export type QueueListener = (ahead: number | null) => void;

export interface BaseRequestOptions {
  responseType?:
    "arraybuffer" | "blob" | "document" | "json" | "text" | "stream";
  timeoutMs?: number;
  waitTimeoutMs?: number;
  streamIdleTimeoutMs?: number;
  signal?: AbortSignal;
  interrupt?: (server: Server) => Promise<unknown>;
  onQueue?: QueueListener;
}

/**
 * Thrown when a request waited for a free server longer than its wait timeout.
 */
export class ServersBusyError extends Error {
  constructor() {
    super("All servers busy: timed out waiting for an available server");
    this.name = "ServersBusyError";
  }
}

const serverEmitter = new EventEmitter();
serverEmitter.setMaxListeners(0);
let wakeCount = 0;

const queues = new WeakMap<Server[], object[]>();

const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

function timerDelay(ms: number) {
  return Math.min(Math.ceil(ms), MAX_TIMER_DELAY_MS);
}

function wakeWaiters() {
  wakeCount++;
  serverEmitter.emit("available");
}

function releaseServer(server: Server) {
  server.available = true;
  wakeWaiters();
}

function queueFor(servers: Server[]): object[] {
  let queue = queues.get(servers);
  if (!queue) {
    queue = [];
    queues.set(servers, queue);
  }
  return queue;
}

function holdServerUntilClosed(
  server: Server,
  source: Readable,
  idleTimeoutMs: number,
): Readable {
  let idleTimer: NodeJS.Timeout | undefined;
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      idleTimer?.refresh();
      callback(null, chunk);
    },
  });

  if (idleTimeoutMs > 0) {
    idleTimer = setTimeout(() => {
      stream.destroy(
        new Error(`Stream idle: no data received for ${idleTimeoutMs}ms`),
      );
    }, timerDelay(idleTimeoutMs));
  }

  stream.once("close", () => {
    clearTimeout(idleTimer);
    releaseServer(server);
  });
  pipeline(source, stream, () => undefined);
  return stream;
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

/**
 * Sends a request to the first free server, trying the next one when a server
 * fails. Requests that find every server busy wait in a first-come,
 * first-served queue shared by everyone using the same server list.
 */
export async function makeBaseRequest<TResponse, TRequest = object>(
  servers: Server[],
  path: string,
  method: HttpMethod,
  data: TRequest,
  {
    responseType,
    timeoutMs = 0,
    waitTimeoutMs = 60_000,
    streamIdleTimeoutMs = 0,
    signal,
    interrupt,
    onQueue,
  }: BaseRequestOptions = {},
): Promise<TResponse> {
  if (servers.length === 0) {
    throw new Error("No servers available");
  }

  const normalizedPath = path.startsWith("/") ? path.substring(1) : path;

  const timeoutTime = waitTimeoutMs > 0 ? Date.now() + waitTimeoutMs : Infinity;

  const failed = new Set<Server>();
  let error: Error | null = null;

  const queue = queueFor(servers);
  const ticket = {};
  let inQueue = false;
  let reportedAhead: number | undefined;

  const leaveQueue = () => {
    if (!inQueue) return;
    queue.splice(queue.indexOf(ticket), 1);
    inQueue = false;
    wakeWaiters();
  };

  try {
    while (true) {
      signal?.throwIfAborted();
      if (!inQueue) {
        if (error) queue.unshift(ticket);
        else queue.push(ticket);
        inQueue = true;
      }
      const wakesSeen = wakeCount;
      const atFront = queue[0] === ticket;
      let busy = !atFront;

      for (const server of atFront ? servers : []) {
        if (failed.has(server)) continue;
        if (!server.available) {
          busy = true;
          continue;
        }

        server.available = false;
        leaveQueue();
        if (reportedAhead !== undefined) {
          reportedAhead = undefined;
          onQueue?.(null);
        }
        let request: Promise<AxiosResponse> | undefined;
        let releaseLater = false;
        try {
          const url = new URL(server.url);
          if (!url.pathname.endsWith("/")) url.pathname += "/";
          url.pathname += normalizedPath;

          log.log(LogLevel.Debug, `Making request to ${url}`);
          request = axios({
            method,
            url: url.toString(),
            data,
            responseType,
            timeout: timeoutMs,
            signal: interrupt ? undefined : signal,
          });
          const result =
            interrupt && signal
              ? await untilAborted(request, signal)
              : await request;
          if (responseType === "stream") {
            const stream = holdServerUntilClosed(
              server,
              result.data as Readable,
              streamIdleTimeoutMs,
            );
            releaseLater = true;
            return stream as TResponse;
          }
          return result.data as TResponse;
        } catch (err) {
          if (signal?.aborted && interrupt && request) {
            const release = () => releaseServer(server);
            void request.then(release, release);
            releaseLater = true;
            void interrupt(server).catch(logError);
          }
          signal?.throwIfAborted();
          error = err as Error;
          failed.add(server);
          logError(error);
        } finally {
          if (!releaseLater) releaseServer(server);
        }
      }

      if (error && !busy) {
        throw error;
      }

      const timeLeft = timeoutTime - Date.now();
      if (timeLeft <= 0) {
        if (error) throw error;
        throw new ServersBusyError();
      }

      if (!inQueue) continue;
      const ahead = queue.indexOf(ticket);
      if (ahead !== reportedAhead) {
        reportedAhead = ahead;
        onQueue?.(ahead);
      }
      if (wakeCount !== wakesSeen) continue;

      log.log(
        LogLevel.Debug,
        `All servers are busy, waiting in line with ${ahead} request(s) ahead.`,
      );
      const waitSignals = signal ? [signal] : [];
      if (waitTimeoutMs > 0) {
        waitSignals.push(AbortSignal.timeout(timerDelay(timeLeft)));
      }
      await once(serverEmitter, "available", {
        signal: AbortSignal.any(waitSignals),
      }).catch(() => undefined);
    }
  } finally {
    leaveQueue();
  }
}
