import axios from "axios";
import { getConfig } from "../config.js";
import {
  makeBaseRequest,
  type HttpMethod,
  type QueueListener,
} from "./base.js";
import { log, LogLevel } from "../utils/logger.js";

import type {
  OllamaPsResponse,
  OllamaShowRequest,
  OllamaShowResponse,
  OllamaStats,
  Server,
} from "../types.js";

export interface OllamaModelInfo {
  name: string;
  model: string;
}

export interface OllamaTagsResponse {
  models: OllamaModelInfo[];
}

export async function makeRequest<TResponse, TRequest = object>(
  path: string,
  method: HttpMethod,
  data: TRequest,
  responseType:
    "arraybuffer" | "blob" | "document" | "json" | "text" | "stream" = "json",
  signal?: AbortSignal,
  onQueue?: QueueListener,
  onServer?: (server: Server) => void,
): Promise<TResponse> {
  const config = getConfig();
  return makeBaseRequest<TResponse, TRequest>(
    config.servers,
    path,
    method,
    data,
    {
      responseType,
      timeoutMs: config.requestTimeout,
      waitTimeoutMs: config.serverWaitTimeout,
      streamIdleTimeoutMs: config.streamIdleTimeout,
      signal,
      onQueue,
      onServer,
    },
  );
}

const modelSystemMessages = new Map<string, string | null>();

async function getModelSystemMessage(
  model: string,
  signal?: AbortSignal,
  onQueue?: QueueListener,
): Promise<string | null> {
  const cached = modelSystemMessages.get(model);
  if (cached !== undefined) return cached;

  const info = await makeRequest<OllamaShowResponse, OllamaShowRequest>(
    "/api/show",
    "post",
    { name: model },
    "json",
    signal,
    onQueue,
  );
  const system = info?.system ?? null;
  modelSystemMessages.set(model, system);
  return system;
}

export async function buildSystemMessage(
  model: string,
  signal?: AbortSignal,
  botContext = "",
  onQueue?: QueueListener,
): Promise<string> {
  const config = getConfig();
  const systemMessages: string[] = [];

  if (config.useModelSystemMessage) {
    try {
      const modelSystemMessage = await getModelSystemMessage(
        model,
        signal,
        onQueue,
      );
      if (modelSystemMessage) systemMessages.push(modelSystemMessage);
    } catch (e) {
      log.log(
        LogLevel.Debug,
        `Could not fetch model system message for ${model}`,
        e,
      );
    }
  }
  if (botContext) systemMessages.push(botContext);
  if (config.useCustomSystemMessage && config.customSystemMessage) {
    systemMessages.push(config.customSystemMessage);
  }

  return systemMessages.join("\n\n");
}

export async function getModels(): Promise<OllamaModelInfo[]> {
  const allModels: OllamaModelInfo[] = [];
  const seenModels = new Set<string>();

  const results = await Promise.allSettled(
    getConfig().servers.map(async (server) => {
      try {
        const response = await axios.get<OllamaTagsResponse>(
          serverUrl(server, "api/tags"),
          { timeout: 5000 },
        );
        return response.data;
      } catch {
        log.log(
          LogLevel.Debug,
          `Failed to fetch models from Ollama server ${server.url}`,
        );
        return null;
      }
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value?.models) {
      for (const model of result.value.models) {
        if (!seenModels.has(model.model)) {
          seenModels.add(model.model);
          allModels.push(model);
        }
      }
    }
  }

  return allModels;
}

function serverUrl(server: Server, path: string): string {
  const url = new URL(server.url);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  url.pathname += path;
  return url.toString();
}

function withDefaultTag(model: string): string {
  return model.includes(":") ? model : `${model}:latest`;
}

/**
 * Looks up the context window Ollama loaded for a model on one server, from
 * `/api/ps`. Skips the request queue, and resolves to undefined whenever the
 * server cannot tell: an error, no matching model, or an Ollama version that
 * does not report `context_length`.
 */
export async function getLoadedContextLength(
  server: Server,
  model: string,
): Promise<number | undefined> {
  try {
    const response = await axios.get<OllamaPsResponse>(
      serverUrl(server, "api/ps"),
      { timeout: 5000 },
    );
    const wanted = withDefaultTag(model);
    const loaded = response.data?.models?.find((entry) =>
      [entry.model, entry.name].some(
        (name) => typeof name === "string" && withDefaultTag(name) === wanted,
      ),
    );
    const contextLength = loaded?.context_length;
    if (
      typeof contextLength === "number" &&
      Number.isSafeInteger(contextLength) &&
      contextLength > 0
    ) {
      return contextLength;
    }
    log.log(
      LogLevel.Debug,
      `Ollama server ${server.url} did not report a loaded context for ${model}`,
    );
  } catch (e) {
    log.log(
      LogLevel.Debug,
      `Could not fetch loaded models from Ollama server ${server.url}`,
      e,
    );
  }
  return undefined;
}

/**
 * Adds the loaded context window of the server that produced an answer to its
 * stats, when stats are shown and the server reports it.
 */
export async function withLoadedContext<T extends OllamaStats>(
  stats: T,
  server: Server | undefined,
): Promise<T> {
  if (!server || !stats.model || !getConfig().showStats) return stats;
  const contextLength = await getLoadedContextLength(server, stats.model);
  return contextLength === undefined
    ? stats
    : { ...stats, context_length: contextLength };
}
