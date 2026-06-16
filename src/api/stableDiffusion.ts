import axios from "axios";
import { config } from "../config.js";
import { makeBaseRequest } from "./base.js";
import { log } from "../utils/logger.js";
import { LogLevel } from "../types.js";

export interface StableDiffusionModel {
  title: string;
  model_name: string;
}

export async function makeStableDiffusionRequest<TResponse, TRequest = object>(
  path: string,
  method: string,
  data: TRequest,
): Promise<TResponse> {
  return makeBaseRequest<TResponse, TRequest>(
    config.stableDiffusionServers,
    config.randomServer,
    path,
    method,
    data,
    undefined,
    config.requestTimeout,
  );
}

export async function getStableDiffusionModels(): Promise<StableDiffusionModel[]> {
  const allModels: StableDiffusionModel[] = [];
  const seenModels = new Set<string>();

  await Promise.allSettled(
    config.stableDiffusionServers.map(async (server) => {
      try {
        const url = new URL(server.url.toString());
        if (!url.pathname.endsWith("/")) url.pathname += "/";
        url.pathname += "sdapi/v1/sd-models";

        const response = await axios.get<StableDiffusionModel[]>(url.toString(), {
          timeout: 5000,
        });

        if (response.data && Array.isArray(response.data)) {
          for (const model of response.data) {
            if (!seenModels.has(model.model_name)) {
              seenModels.add(model.model_name);
              allModels.push(model);
            }
          }
        }
      } catch (error) {
        log.log(LogLevel.Debug, `Failed to fetch models from SD server ${server.url}`);
      }
    })
  );

  return allModels;
}
