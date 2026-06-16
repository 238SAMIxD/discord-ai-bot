import { config } from "../config.js";
import { makeBaseRequest } from "./base.js";

export async function makeStableDiffusionRequest<T = unknown>(
  path: string,
  method: string,
  data: Record<string, unknown>,
): Promise<T> {
  return makeBaseRequest<T>(
    config.stableDiffusionServers,
    config.randomServer,
    path,
    method,
    data,
    undefined,
    config.requestTimeout,
  );
}
