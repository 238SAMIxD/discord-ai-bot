import axios from "axios";
import { log, logError } from "../utils/logger.js";
import { LogLevel } from "../types.js";
import { shuffleArray } from "../utils/helpers.js";
import type { Server } from "../types.js";

const SERVER_WAIT_TIMEOUT_MS = 60_000;

export async function makeBaseRequest<T = unknown>(
	servers: Server[],
	randomServer: boolean,
	path: string,
	method: string,
	data: Record<string, unknown>,
	responseType?: "arraybuffer" | "blob" | "document" | "json" | "text" | "stream"
): Promise<T> {
	if (servers.length == 0) {
		throw new Error("No servers available");
	}

	if (servers.every(server => !server.available)) {
		log.log(LogLevel.Debug, "All servers are busy, waiting for an available server.");
		const waitStart = Date.now();
		while (servers.every(server => !server.available)) {
			if (Date.now() - waitStart > SERVER_WAIT_TIMEOUT_MS) {
				throw new Error("All servers busy: timed out waiting for an available server");
			}
			await new Promise(res => setTimeout(res, 1000));
		}
	}

	let error: Error | null = null;
	let order: number[] = new Array(servers.length).fill(0).map((_, i) => i);
	if (randomServer) order = shuffleArray(order);

	for (const i of order) {
		try {
			if (!servers[i].available) continue;
			const url = new URL(servers[i].url.toString());

			servers[i].available = false;

			if (path.startsWith("/")) path = path.substring(1);
			if (!url.pathname.endsWith("/")) url.pathname += "/";
			url.pathname += path;

			log.log(LogLevel.Debug, `Making request to ${url}`);
			const result = await axios({
				method, url: url.toString(), data,
				responseType
			});
			servers[i].available = true;
			return result.data as T;
		} catch (err) {
			servers[i].available = true;
			error = err as Error;
			logError(error);
		}
	}
	if (!error) {
		throw new Error("No servers available");
	}
	throw error;
}
