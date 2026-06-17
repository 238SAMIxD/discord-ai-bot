import dotenv from "dotenv";
import { getBoolean, parseEnvString, parsePositiveInt } from "./utils/helpers.js";
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

function parseServers(value: string | undefined, envName: string): Server[] {
  return (value ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0)
    .map((url): Server => {
      try {
        new URL(url); // validate URL format
      } catch {
        throw new Error(`Invalid URL in ${envName}: ${url}`);
      }
      return { url, available: true };
    });
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

  const customSystemMessage = parseEnvString(process.env.SYSTEM ?? process.env.SYSTEM_MESSAGE);
  const token = process.env.TOKEN ?? process.env.DISCORD_TOKEN;

  if (!token) {
    throw new Error("TOKEN or DISCORD_TOKEN environment variable is required");
  }

  const servers = parseServers(process.env.OLLAMA ?? process.env.OLLAMA_SERVERS, "OLLAMA");
  if (servers.length === 0) {
    throw new Error("No servers available");
  }


  cachedConfig = {
    token,
    model: process.env.MODEL ?? "orca",
    servers,
    stableDiffusionServers: parseServers(
      process.env.STABLE_DIFFUSION ?? process.env.SD_SERVERS,
      "STABLE_DIFFUSION",
    ),
    channels: (process.env.CHANNELS ?? "").split(",").filter((c) => c.length > 0),
    customSystemMessage,
    useCustomSystemMessage:
      getBoolean(process.env.USE_SYSTEM) && !!customSystemMessage,
    useModelSystemMessage: getBoolean(process.env.USE_MODEL_SYSTEM),
    randomServer: getBoolean(process.env.RANDOM_SERVER),
    requestTimeout: parsePositiveInt(process.env.REQUEST_TIMEOUT, 0),
    maxAttachmentTextLength: parsePositiveInt(
      process.env.MAX_ATTACHMENT_TEXT_LENGTH,
      8000,
    ),
  };

  return cachedConfig;
}
