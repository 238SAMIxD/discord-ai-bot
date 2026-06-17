import { AxiosError } from "axios";

/**
 * Serializable logger state for IPC transfer.
 */
export interface LoggerData {
  production: boolean;
  name: string;
}

/**
 * Log severity levels.
 */
export enum LogLevel {
  Info = "info",
  Warn = "warn",
  Debug = "debug",
  Error = "error",
}

/**
 * Simple logger that supports production/debug modes and named contexts.
 *
 * The instance is callable via the `log()` method.
 */
export class Logger {
  public readonly data: LoggerData;
  private readonly production: boolean;
  private readonly name: string;

  constructor(production: boolean, name: string);
  constructor(data: LoggerData);
  constructor(productionOrData: boolean | LoggerData, name?: string) {
    if (typeof productionOrData === "object") {
      this.data = productionOrData;
      this.production = productionOrData.production;
      this.name = productionOrData.name;
    } else {
      this.production = productionOrData;
      this.name = name ?? "Logger";
      this.data = { production: this.production, name: this.name };
    }
  }

  /**
   * Log a message at the given severity level.
   * Debug messages are suppressed in production mode.
   */
  log<T>(level: LogLevel, ...args: T[]): void {
    if (level === LogLevel.Debug && this.production) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.name}] [${level.toUpperCase()}]`;

    switch (level) {
      case LogLevel.Error:
        console.error(prefix, ...args);
        break;
      case LogLevel.Warn:
        console.warn(prefix, ...args);
        break;
      case LogLevel.Debug:
        console.debug(prefix, ...args);
        break;
      case LogLevel.Info:
      default:
        console.log(prefix, ...args);
        break;
    }
  }

  info<T>(...args: T[]): void {
    this.log(LogLevel.Info, ...args);
  }

  warn<T>(...args: T[]): void {
    this.log(LogLevel.Warn, ...args);
  }

  error<T>(...args: T[]): void {
    this.log(LogLevel.Error, ...args);
  }

  debug<T>(...args: T[]): void {
    this.log(LogLevel.Debug, ...args);
  }
}

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
