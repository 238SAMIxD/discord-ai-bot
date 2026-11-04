import axios from "axios";
import { getConfig } from "../config.js";
import { makeBaseRequest, type HttpMethod } from "./base.js";
import { log, LogLevel } from "../utils/logger.js";

import type { Server } from "../types.js";

export interface StableDiffusionModel {
  title: string;
  model_name: string;
}

async function interruptGeneration(server: Server): Promise<void> {
  const url = new URL(server.url);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  url.pathname += "sdapi/v1/interrupt";

  log.log(LogLevel.Debug, `Interrupting the generation on ${url}`);
  await axios.post(url.toString(), undefined, { timeout: 5000 });
}

export async function makeStableDiffusionRequest<TResponse, TRequest = object>(
  path: string,
  method: HttpMethod,
  data: TRequest,
  signal?: AbortSignal,
): Promise<TResponse> {
  return makeBaseRequest<TResponse, TRequest>(
    getConfig().stableDiffusionServers,
    path,
    method,
    data,
    undefined,
    getConfig().requestTimeout,
    getConfig().serverWaitTimeout,
    0,
    signal,
    interruptGeneration,
  );
}

export async function getStableDiffusionModels(): Promise<
  StableDiffusionModel[]
> {
  const allModels: StableDiffusionModel[] = [];
  const seenModels = new Set<string>();

  const results = await Promise.allSettled(
    getConfig().stableDiffusionServers.map(async (server) => {
      try {
        const url = new URL(server.url);
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
