import { Logger, LogLevel } from "../types.js";
import { AxiosError } from "axios";

function getInitialLoggerName(): string {
  const shardEnv = process.env.SHARDS;
  if (!shardEnv) {
    return "Unknown Shard";
  }

  try {
    const parsed = JSON.parse(shardEnv) as number | string | (number | string)[];
    if (Array.isArray(parsed) && parsed.length === 1) {
      return `Shard #${String(parsed[0])}`;
    }
    if (typeof parsed === "number" || typeof parsed === "string") {
      return `Shard #${String(parsed)}`;
    }
  } catch {
    return `Shard #${shardEnv}`;
  }

  return `Shard #${shardEnv}`;
}

export let log = new Logger(false, getInitialLoggerName());

export function setLogger(newLog: Logger) {
  log = newLog;
}

export const logError = <E>(error: E): void => {
  if (error instanceof AxiosError && error.response) {
    const method = String(error.config?.method ?? "UNKNOWN").toUpperCase();
    const url = String(error.config?.url ?? "");
    let str = `Error ${error.response.status} ${error.response.statusText}: ${method} ${url}`;
    const data = error.response.data as { error?: string } | undefined;
    if (data?.error) {
      str += ": " + String(data.error);
    }
    log.log(LogLevel.Error, str);
  } else {
    log.log(LogLevel.Error, error);
  }
};
