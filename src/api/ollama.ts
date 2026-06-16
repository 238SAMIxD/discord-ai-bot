import axios from "axios";
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

export async function makeRequest<TResponse, TRequest = object>(
  path: string,
  method: string,
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
  const allModels: OllamaModelInfo[] = [];
  const seenModels = new Set<string>();

  await Promise.allSettled(
    config.servers.map(async (server) => {
      try {
        const url = new URL(server.url.toString());
        if (!url.pathname.endsWith("/")) url.pathname += "/";
        url.pathname += "api/tags";

        const response = await axios.get<OllamaTagsResponse>(url.toString(), {
          timeout: 5000,
        });

        if (response.data && response.data.models) {
          for (const model of response.data.models) {
            if (!seenModels.has(model.model)) {
              seenModels.add(model.model);
              allModels.push(model);
            }
          }
        }
      } catch (error) {
        log.log(LogLevel.Debug, `Failed to fetch models from Ollama server ${server.url}`);
      }
    })
  );

  return allModels;
}
