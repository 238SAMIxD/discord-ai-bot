import axios from "axios";
import { getConfig } from "../config.js";
import { makeBaseRequest, type HttpMethod } from "./base.js";
import { log, LogLevel } from "../utils/logger.js";

export interface StableDiffusionModel {
  title: string;
  model_name: string;
}

export async function makeStableDiffusionRequest<TResponse, TRequest = object>(
  path: string,
  method: HttpMethod,
  data: TRequest,
): Promise<TResponse> {
  return makeBaseRequest<TResponse, TRequest>(
    getConfig().stableDiffusionServers,
    getConfig().randomServer,
    path,
    method,
    data,
    undefined,
    getConfig().requestTimeout,
  );
}

export async function getStableDiffusionModels(): Promise<StableDiffusionModel[]> {
  const allModels: StableDiffusionModel[] = [];
  const seenModels = new Set<string>();

  const results = await Promise.allSettled(
    getConfig().stableDiffusionServers.map(async (server) => {
      try {
        const url = new URL(server.url.toString());
        if (!url.pathname.endsWith("/")) url.pathname += "/";
        url.pathname += "sdapi/v1/sd-models";

        const response = await axios.get<StableDiffusionModel[]>(
          url.toString(),
          {
            timeout: 5000,
          },
        );
        return response.data;
      } catch {
        log.log(
          LogLevel.Debug,
          `Failed to fetch models from SD server ${server.url}`,
        );
        return null;
      }
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && Array.isArray(result.value)) {
      for (const model of result.value) {
        if (!seenModels.has(model.model_name)) {
          seenModels.add(model.model_name);
          allModels.push(model);
        }
      }
    }
  }

  return allModels;
}
