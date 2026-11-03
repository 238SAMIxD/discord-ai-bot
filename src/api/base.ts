import { EventEmitter, once } from "node:events";
import axios from "axios";

import { log, logError, LogLevel } from "../utils/logger.js";

import type { Readable } from "node:stream";
import type { Server } from "../types.js";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

const serverEmitter = new EventEmitter();
serverEmitter.setMaxListeners(0);

function releaseServer(server: Server) {
  server.available = true;
  serverEmitter.emit("available");
}

export async function makeBaseRequest<TResponse, TRequest = object>(
  servers: Server[],
  path: string,
  method: HttpMethod,
  data: TRequest,
  responseType?:
    | "arraybuffer"
    | "blob"
    | "document"
    | "json"
    | "text"
    | "stream",
  timeoutMs = 0,
  waitTimeoutMs = 0,
): Promise<TResponse> {
  if (servers.length === 0) {
    throw new Error("No servers available");
  }

  const normalizedPath = path.startsWith("/") ? path.substring(1) : path;

  const timeoutTime = waitTimeoutMs > 0 ? Date.now() + waitTimeoutMs : Infinity;

  while (true) {
    let error: Error | null = null;

    for (const server of servers) {
      if (!server.available) continue;

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
        });
        if (responseType === "stream") {
          (result.data as Readable).once("close", () => releaseServer(server));
          releaseOnClose = true;
        }
        return result.data as TResponse;
      } catch (err) {
        error = err as Error;
        logError(error);
      } finally {
        if (!releaseOnClose) releaseServer(server);
      }
    }

    if (error) {
      throw error;
    }

    const timeLeft = timeoutTime - Date.now();
    if (timeLeft <= 0) {
      throw new Error("All servers busy: timed out waiting for an available server");
    }

    log.log(LogLevel.Debug, "All servers are busy, waiting for an available server.");
    await once(serverEmitter, "available", {
      signal: waitTimeoutMs > 0 ? AbortSignal.timeout(timeLeft) : undefined,
    }).catch(() => undefined);
  }
}

