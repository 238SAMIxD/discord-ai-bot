import { randomUUID } from "node:crypto";
import axios from "axios";
import { getConfig } from "../config.js";
import { makeBaseRequest, type HttpMethod } from "./base.js";
import { log, LogLevel } from "../utils/logger.js";

import type { Server } from "../types.js";

export interface StableDiffusionModel {
  title: string;
  model_name: string;
}

interface TaskProgress {
  active?: boolean;
}

function serverUrl(server: Server, path: string): string {
  const url = new URL(server.url);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  url.pathname += path;
  return url.toString();
}

async function interruptTask(server: Server, taskId: string): Promise<void> {
  const { data } = await axios.post<TaskProgress>(
    serverUrl(server, "internal/progress"),
    { id_task: taskId, live_preview: false },
    { timeout: 5000 },
  );
  if (!data.active) return;

  log.log(LogLevel.Debug, `Interrupting task ${taskId} on ${server.url}`);
  await axios.post(serverUrl(server, "sdapi/v1/interrupt"), undefined, {
    timeout: 5000,
  });
}

export async function makeStableDiffusionRequest<
  TResponse,
  TRequest extends object = object,
>(
  path: string,
  method: HttpMethod,
  data: TRequest,
  signal?: AbortSignal,
): Promise<TResponse> {
  const taskId = randomUUID();
  return makeBaseRequest<TResponse, TRequest & { force_task_id: string }>(
    getConfig().stableDiffusionServers,
    path,
    method,
    { ...data, force_task_id: taskId },
    undefined,
    getConfig().requestTimeout,
    getConfig().serverWaitTimeout,
    0,
    signal,
    (server) => interruptTask(server, taskId),
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
