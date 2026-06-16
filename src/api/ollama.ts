import { config } from "../config.js";
import { makeBaseRequest } from "./base.js";
import { log } from "../utils/logger.js";
import { LogLevel } from "../types.js";

export interface OllamaModelInfo {
  name: string;
  model: string;
}

export interface OllamaTagsResponse {
  models: OllamaModelInfo[];
}

export async function makeRequest<T = string>(
  path: string,
  method: string,
  data: Record<string, unknown>,
  responseType:
    | "arraybuffer"
    | "blob"
    | "document"
    | "json"
    | "text"
    | "stream" = "text",
): Promise<T> {
  return makeBaseRequest<T>(
    config.servers,
    config.randomServer,
    path,
    method,
    data,
    responseType,
    config.requestTimeout,
  );
}

export async function getModels(): Promise<OllamaModelInfo[]> {
  try {
    const data = await makeRequest<OllamaTagsResponse>("/api/tags", "get", {});
    return data.models ?? [];
  } catch (error) {
    log.log(LogLevel.Error, "Failed to fetch models from Ollama", error);
    return [];
  }
}
