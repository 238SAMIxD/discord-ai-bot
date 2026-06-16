import EventEmitter from "events";
import axios from "axios";

import { shuffleArray } from "../utils/helpers.js";
import { log, logError, LogLevel } from "../utils/logger.js";

import type { Server } from "../types.js";

const SERVER_WAIT_TIMEOUT_MS = 60_000;
const serverEmitter = new EventEmitter();

export async function makeBaseRequest<TResponse, TRequest = object>(
  servers: Server[],
  randomServer: boolean,
  path: string,
  method: string,
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
  let order: number[] = new Array(servers.length).fill(0).map((_, i) => i);
  if (randomServer) order = shuffleArray(order);

  for (const i of order) {
    if (!servers[i].available) continue;

    servers[i].available = false;
    try {
      const url = new URL(servers[i].url.toString());
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
