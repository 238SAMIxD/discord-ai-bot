import { EventEmitter, once } from "node:events";
import { pipeline, Transform } from "node:stream";
import axios from "axios";

import { log, logError, LogLevel } from "../utils/logger.js";

import type { Readable } from "node:stream";
import type { Server } from "../types.js";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

const serverEmitter = new EventEmitter();
serverEmitter.setMaxListeners(0);

const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

function timerDelay(ms: number) {
  return Math.min(Math.ceil(ms), MAX_TIMER_DELAY_MS);
}

function releaseServer(server: Server) {
  server.available = true;
  serverEmitter.emit("available");
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

export async function makeBaseRequest<TResponse, TRequest = object>(
  servers: Server[],
  path: string,
  method: HttpMethod,
  data: TRequest,
  responseType?:
    "arraybuffer" | "blob" | "document" | "json" | "text" | "stream",
  timeoutMs = 0,
  waitTimeoutMs = 60_000,
  streamIdleTimeoutMs = 0,
  signal?: AbortSignal,
): Promise<TResponse> {
  if (servers.length === 0) {
    throw new Error("No servers available");
  }

  const normalizedPath = path.startsWith("/") ? path.substring(1) : path;

  const timeoutTime = waitTimeoutMs > 0 ? Date.now() + waitTimeoutMs : Infinity;

  const failed = new Set<Server>();
  let error: Error | null = null;

  while (true) {
    signal?.throwIfAborted();
    let busy = false;

    for (const server of servers) {
      if (failed.has(server)) continue;
      if (!server.available) {
        busy = true;
        continue;
      }

      server.available = false;
      let releaseOnClose = false;
      try {
        const url = new URL(server.url);
        if (!url.pathname.endsWith("/")) url.pathname += "/";
        url.pathname += normalizedPath;

        log.log(LogLevel.Debug, `Making request to ${url}`);
        const result = await axios({
          method,
          url: url.toString(),
          data,
          responseType,
          timeout: timeoutMs,
          signal,
        });
        if (responseType === "stream") {
          const stream = holdServerUntilClosed(
            server,
            result.data as Readable,
            streamIdleTimeoutMs,
          );
          releaseOnClose = true;
          return stream as TResponse;
        }
        return result.data as TResponse;
      } catch (err) {
        signal?.throwIfAborted();
        error = err as Error;
        failed.add(server);
        logError(error);
      } finally {
        if (!releaseOnClose) releaseServer(server);
      }
    }

    if (error && !busy) {
      throw error;
    }

    const timeLeft = timeoutTime - Date.now();
    if (timeLeft <= 0) {
      if (error) throw error;
      throw new Error(
        "All servers busy: timed out waiting for an available server",
      );
    }

    log.log(
      LogLevel.Debug,
      "All servers are busy, waiting for an available server.",
    );
    const waitSignals = signal ? [signal] : [];
    if (waitTimeoutMs > 0) {
      waitSignals.push(AbortSignal.timeout(timerDelay(timeLeft)));
    }
    await once(serverEmitter, "available", {
      signal: AbortSignal.any(waitSignals),
    }).catch(() => undefined);
  }
}
