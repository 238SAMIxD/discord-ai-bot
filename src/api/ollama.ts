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

interface CachedModelInfo {
  info: OllamaShowResponse;
  fetchedAt: number;
}

const modelInfo = new Map<string, CachedModelInfo>();

const NO_VISION_RECHECK_MS = 5 * 60_000;

export function clearModelInfoCache(): void {
  modelInfo.clear();
}

async function getModelInfo(
  model: string,
  signal?: AbortSignal,
  onQueue?: QueueListener,
  maxAgeMs = Infinity,
): Promise<OllamaShowResponse> {
  signal?.throwIfAborted();
  const cached = modelInfo.get(model);
  if (cached && Date.now() - cached.fetchedAt < maxAgeMs) return cached.info;

  const info = await makeRequest<OllamaShowResponse, OllamaShowRequest>(
    "/api/show",
    "post",
    { name: model },
    "json",
    signal,
    onQueue,
  );
  const result = info ?? {};
  modelInfo.set(model, { info: result, fetchedAt: Date.now() });
  return result;
}

async function getModelSystemMessage(
  model: string,
  signal?: AbortSignal,
  onQueue?: QueueListener,
): Promise<string | null> {
  const info = await getModelInfo(model, signal, onQueue);
  return info.system ?? null;
}

const VISION_FAMILIES = ["clip", "mllama"];

function hasVision(info: OllamaShowResponse): boolean {
  if (Array.isArray(info.capabilities)) {
    return info.capabilities.includes("vision");
  }
  const families = info.details?.families;
  return (
    Array.isArray(families) &&
    families.some((family) => VISION_FAMILIES.includes(family))
  );
}

export async function supportsVision(
  model: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const cached = modelInfo.get(model);
    if (cached && hasVision(cached.info)) {
      signal?.throwIfAborted();
      return true;
    }
    return hasVision(
      await getModelInfo(model, signal, undefined, NO_VISION_RECHECK_MS),
    );
  } catch (e) {
    signal?.throwIfAborted();
    log.log(
      LogLevel.Debug,
      `Could not tell whether ${model} supports vision`,
      e,
    );
    return false;
  }
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

interface ModelsLookup {
  models: OllamaModelInfo[];
  reachable: boolean;
}

async function lookUpModels(signal?: AbortSignal): Promise<ModelsLookup> {
  const allModels: OllamaModelInfo[] = [];
  const seenModels = new Set<string>();
  let reachable = false;

  const results = await Promise.allSettled(
    getConfig().servers.map(async (server) => {
      try {
        const response = await axios.get<OllamaTagsResponse>(
          serverUrl(server, "api/tags"),
          { timeout: 5000, signal },
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
    if (result.status === "fulfilled" && result.value) reachable = true;
    if (result.status === "fulfilled" && result.value?.models) {
      for (const model of result.value.models) {
        if (!seenModels.has(model.model)) {
          seenModels.add(model.model);
          allModels.push(model);
        }
      }
    }
  }

  return { models: allModels, reachable };
}

export async function getModels(): Promise<OllamaModelInfo[]> {
  return (await lookUpModels()).models;
}

export class OllamaUnreachableError extends Error {
  constructor() {
    super("No Ollama server answered");
    this.name = "OllamaUnreachableError";
  }
}

export async function getVisionModels(
  signal?: AbortSignal,
): Promise<OllamaModelInfo[]> {
  const { models, reachable } = await lookUpModels(signal);
  signal?.throwIfAborted();
  if (!reachable) throw new OllamaUnreachableError();
  const vision = await Promise.all(
    models.map((model) => supportsVision(model.model, signal)),
  );
  return models.filter((_, i) => vision[i]);
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
