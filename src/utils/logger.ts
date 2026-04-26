import { Logger, LogLevel } from "../types.js";
import { AxiosError } from "axios";

export let log = new Logger(false, "Unknown Shard");

export function setLogger(newLog: Logger) {
	log = newLog;
}

export const logError = (error: unknown): void => {
	if (error instanceof AxiosError && error.response) {
		let str = `Error ${error.response.status} ${error.response.statusText}: ${error.request?.method ?? "UNKNOWN"} ${error.request?.path ?? ""}`;
		const data = error.response.data as Record<string, unknown> | undefined;
		if (data?.error) {
			str += ": " + String(data.error);
		}
		log.log(LogLevel.Error, str);
	} else {
		log.log(LogLevel.Error, error);
	}
};
