import dotenv from "dotenv";
import { getBoolean, parseEnvString, parseTimeout } from "./utils/helpers.js";
import type { Server } from "./types.js";

export interface Config {
  token: string;
  model: string;
  servers: Server[];
  stableDiffusionServers: Server[];
  channels: string[];
  customSystemMessage: string | null;
  useCustomSystemMessage: boolean;
  useModelSystemMessage: boolean;
  randomServer: boolean;
  requestTimeout: number;
  maxAttachmentTextLength: number;
}

function parseServerUrl(url: string, envName: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new Error(`Invalid URL in ${envName}: ${url}`);
  }
}

function parseServers(value: string | undefined, envName: string): Server[] {
  return (value ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0)
    .map(
      (url): Server => ({ url: parseServerUrl(url, envName), available: true }),
    );
}

let cachedConfig: Config | null = null;

export function clearConfigCache() {
  cachedConfig = null;
}

export function getConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  dotenv.config();

  const customSystemMessage = parseEnvString(process.env.SYSTEM);
  const token = process.env.TOKEN ?? process.env.DISCORD_TOKEN;

  if (!token) {
    throw new Error("TOKEN or DISCORD_TOKEN environment variable is required");
  }

  const servers = parseServers(process.env.OLLAMA, "OLLAMA");
  if (servers.length === 0) {
    throw new Error("No servers available");
  }

  if (process.env.CHANNELS === undefined) {
    throw new Error(
      "CHANNELS environment variable is missing. If DM-only mode is intended, set it to an empty string.",
    );
  }

  cachedConfig = {
    token,
    model: process.env.MODEL ?? "orca",
    servers,
    stableDiffusionServers: parseServers(
      process.env.STABLE_DIFFUSION,
      "STABLE_DIFFUSION",
    ),
    channels: (process.env.CHANNELS ?? "").split(",").filter((c) => c.length > 0),
    customSystemMessage,
    useCustomSystemMessage:
      getBoolean(process.env.USE_SYSTEM) && !!customSystemMessage,
    useModelSystemMessage: getBoolean(process.env.USE_MODEL_SYSTEM),
    randomServer: getBoolean(process.env.RANDOM_SERVER),
    requestTimeout: parseTimeout(process.env.REQUEST_TIMEOUT, 0),
    maxAttachmentTextLength: parseTimeout(
      process.env.MAX_ATTACHMENT_TEXT_LENGTH,
      8000,
    ),
  };

  return cachedConfig;
}
