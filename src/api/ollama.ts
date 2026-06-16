import { config } from "../config.js";
import { makeBaseRequest } from "./base.js";

export async function makeRequest<T = string>(path: string, method: string, data: Record<string, unknown>): Promise<T> {
	return makeBaseRequest<T>(config.servers, config.randomServer, path, method, data, "text", config.requestTimeout);
}
