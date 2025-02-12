export interface LogLevel {
  name: string;
  color: number[] | null;
  error: boolean;
  production: boolean;
  textColor: number[] | null;
}

export const LogLevel: {
  Debug: "Debug";
  Info: "Info";
  Success: "Success";
  Warning: "Warning";
  Error: "Error";
  Fatal: "Fatal";
};

export type LogLevelType = keyof typeof LogLevel;

export interface LoggerOptions {
  production: boolean;
  prefix?: string;
}

export interface Logger {
  (level: LogLevelType, ...messages: any[]): void;
  data: Readonly<LoggerOptions>;
}

export function Logger(production: boolean, prefix?: string): Logger;
export function Logger(options: LoggerOptions): Logger;
export function Logger(logger: Logger): Logger;
