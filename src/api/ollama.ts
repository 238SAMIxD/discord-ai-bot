import axios from "axios";
import { getConfig } from "../config.js";
import { makeBaseRequest, type HttpMethod } from "./base.js";
import { log, LogLevel } from "../utils/logger.js";

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
    | "arraybuffer"
    | "blob"
    | "document"
    | "json"
    | "text"
    | "stream" = "text",
): Promise<TResponse> {
  return makeBaseRequest<TResponse, TRequest>(
    getConfig().servers,
    path,
    method,
    data,
    responseType,
    getConfig().requestTimeout,
  );
}

export async function getModels(): Promise<OllamaModelInfo[]> {
  const allModels: OllamaModelInfo[] = [];
  const seenModels = new Set<string>();

  const results = await Promise.allSettled(
    getConfig().servers.map(async (server) => {
      try {
        const url = new URL(server.url);
        if (!url.pathname.endsWith("/")) url.pathname += "/";
        url.pathname += "api/tags";

        const response = await axios.get<OllamaTagsResponse>(url.toString(), {
          timeout: 5000,
        });
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
