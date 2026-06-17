import { EventEmitter } from "node:events";
import axios from "axios";

import { log, logError, LogLevel } from "../utils/logger.js";

import type { Server } from "../types.js";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

const SERVER_WAIT_TIMEOUT_MS = 60_000;
const serverEmitter = new EventEmitter();

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
): Promise<TResponse> {
  if (servers.length === 0) {
    throw new Error("No servers available");
  }

  const normalizedPath = path.startsWith("/") ? path.substring(1) : path;

  if (servers.every((server) => !server.available)) {
    log.log(
      LogLevel.Debug,
      "All servers are busy, waiting for an available server.",
    );
    await new Promise<void>((resolve, reject) => {
      const onAvailable = () => {
        if (servers.some((s) => s.available)) {
          cleanup();
          resolve();
        }
      };
      const onTimeout = () => {
        cleanup();
        reject(
          new Error(
            "All servers busy: timed out waiting for an available server",
          ),
        );
      };
      const timer = setTimeout(onTimeout, SERVER_WAIT_TIMEOUT_MS);
      serverEmitter.on("available", onAvailable);

      function cleanup() {
        clearTimeout(timer);
        serverEmitter.off("available", onAvailable);
      }

      // Check one more time in case it became available before we attached the listener
      if (servers.some((s) => s.available)) {
        cleanup();
        resolve();
      }
    });
  }

  let error: Error | null = null;

  for (let i = 0; i < servers.length; i++) {
    if (!servers[i].available) continue;

    servers[i].available = false;
    try {
      const url = new URL(servers[i].url);
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
      return result.data as TResponse;
    } catch (err) {
      error = err as Error;
      logError(error);
    } finally {
      servers[i].available = true;
      serverEmitter.emit("available");
    }
  }
  if (!error) {
    throw new Error("No servers available");
  }
  throw error;
}
