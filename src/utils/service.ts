import axios, { Method } from "axios";
import { LogLevel } from "meklog";

import { log } from "../bot";
import { ChatOptions } from "../commands/chat";
import { CommandsOptions } from "../commands/commands";

export enum METHOD {
  GET = "GET",
  POST = "POST",
}

export async function makeRequest(
  server: string,
  endpoint: string,
  method: Method,
  data: CommandsOptions | ChatOptions,
  stream = false
) {
  if (!server) {
    throw new Error("No server configured. Please update the .env configuration.");
  }

  const url = new URL(endpoint, server);
  try {
    log(LogLevel.Debug, `Making request to ${url}`);

    const response = await axios({
      method,
      url: url.toString(),
      data,
      responseType: stream ? "stream" : "json",
    });

    return response.data;
  } catch (error) {
    log(LogLevel.Error, `Failed to make request to ${url} - ${error}`);
  }
}

export async function getModels(server: string, endpoint: string) {
  const url = new URL(endpoint, server);
  try {
    log(LogLevel.Debug, `Getting models from ${url}`);

    const response = await axios.get(url.toString());
    return response.data;
  } catch (error) {
    log(LogLevel.Error, `Failed to get models from ${url} - ${error}`);
    return null;
  }
}
